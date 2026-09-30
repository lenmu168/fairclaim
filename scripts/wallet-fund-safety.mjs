import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("../server/node_modules/typescript");
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

// P0 policy: FairClaim V1 authenticates with SIWS/sign-message only. Identifiers
// capable of authorizing or constructing asset-state changes are forbidden in
// first-party runtime code, even when introduced without an immediate call site.
const forbiddenFundIdentifiers = new Set([
  "signAndSendTransaction",
  "signTransactions",
  "signTransaction",
  "signAllTransactions",
  "sendTransaction",
  "sendRawTransaction",
  "transfer",
  "transferChecked",
  "createTransferInstruction",
  "approve",
  "approveChecked",
  "createApproveInstruction",
  "delegate",
  "setAuthority",
  "createSetAuthorityInstruction",
  "swap",
  "stake",
  "escrow",
  "mintTo",
  "burn",
  "SystemProgram",
  "Transaction",
  "VersionedTransaction",
  "TransactionMessage",
]);
const forbiddenSecretFields = new Set([
  "seedphrase",
  "mnemonic",
  "privatekey",
  "secretkey",
  "seedvaultsecretkey",
]);
const allowedWalletBindings = new Set([
  "account",
  "chain",
  "connect",
  "connectAnd",
  "disconnect",
  "signIn",
  "signMessages",
]);
const codeExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".mjs",
  ".cjs",
]);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.name === "generated" ||
    entry.name === "node_modules" ||
    entry.name === "dist"
      ? []
      : entry.isDirectory()
        ? walk(join(dir, entry.name))
        : codeExtensions.has(extname(entry.name))
          ? [join(dir, entry.name)]
          : [],
  );
}

function scanSource(text, file) {
  const findings = [];
  const kind = file.endsWith("x")
    ? ts.ScriptKind.TSX
    : file.endsWith(".ts") || file.endsWith(".mts")
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  function finding(node, rule, name) {
    const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
    findings.push({ file, line: pos.line + 1, rule, name });
  }
  function isReadOnlyCapabilityReceiver(node) {
    let current = node;
    let parent = current.parent;
    while (
      parent &&
      (ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isTypeAssertionExpression(parent) ||
        ts.isNonNullExpression(parent)) &&
      parent.expression === current
    ) {
      current = parent;
      parent = current.parent;
    }
    return (
      parent &&
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === current &&
      parent.name.text === "getCapabilities" &&
      ts.isCallExpression(parent.parent) &&
      parent.parent.expression === parent
    );
  }
  function validateConnectAnd(call) {
    const callback = call.arguments[0];
    if (
      call.arguments.length !== 1 ||
      (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) ||
      callback.parameters.length !== 1 ||
      !ts.isIdentifier(callback.parameters[0].name)
    ) {
      finding(call, "unrestricted wallet diagnostic session", "connectAnd");
      return;
    }
    const parameter = callback.parameters[0].name;
    function inspectCallback(node) {
      if (
        ts.isIdentifier(node) &&
        node.text === parameter.text &&
        node !== parameter &&
        !isReadOnlyCapabilityReceiver(node)
      )
        finding(
          node,
          "wallet session may only inspect capabilities",
          node.text,
        );
      ts.forEachChild(node, inspectCallback);
    }
    inspectCallback(callback.body);
  }
  function validateSignMessages(call) {
    const payload = call.arguments[0];
    if (
      call.arguments.length !== 1 ||
      !ts.isIdentifier(payload) ||
      payload.text !== "canonicalMessageBytes"
    )
      finding(
        call,
        "signMessages may only sign server canonical authentication bytes",
        "signMessages",
      );
  }
  function containsIdentityMessageMaterial(node) {
    let found = false;
    function inspect(current) {
      if (
        (ts.isIdentifier(current) &&
          [
            "canonicalMessage",
            "canonicalMessageBytes",
            "preSignPreview",
          ].includes(current.text)) ||
        (ts.isPropertyAccessExpression(current) &&
          current.name.text === "message" &&
          ts.isIdentifier(current.expression) &&
          ["preview", "preSignPreview"].includes(current.expression.text))
      )
        found = true;
      if (!found) ts.forEachChild(current, inspect);
    }
    inspect(node);
    return found;
  }
  function visit(node) {
    if (
      (ts.isIdentifier(node) || ts.isStringLiteral(node)) &&
      forbiddenFundIdentifiers.has(node.text)
    )
      finding(node, "asset-state capability", node.text);
    if (
      (ts.isIdentifier(node) || ts.isStringLiteral(node)) &&
      forbiddenSecretFields.has(node.text.replaceAll("_", "").toLowerCase())
    )
      finding(node, "wallet secret field", node.text);
    if (
      ts.isIdentifier(node) &&
      file.includes(`${join("mobile", "")}`) &&
      [
        "DATABASE_URL",
        "SOLANA_MAINNET_RPC_URL",
        "RPC_API_KEY",
        "SERVER_SECRET",
        "PRIVATE_KEY",
      ].includes(node.text)
    )
      finding(node, "server secret in mobile runtime", node.text);
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "useMobileWallet"
    ) {
      const declaration = node.parent;
      if (
        !ts.isVariableDeclaration(declaration) ||
        !ts.isObjectBindingPattern(declaration.name)
      )
        finding(node, "unrestricted wallet hook", "useMobileWallet");
      else
        for (const element of declaration.name.elements) {
          const binding = element.propertyName ?? element.name;
          const name = ts.isIdentifier(binding)
            ? binding.text
            : binding.getText(source);
          if (!allowedWalletBindings.has(name))
            finding(
              binding,
              "wallet capability outside authentication allowlist",
              name,
            );
          if (
            (name === "connectAnd" || name === "signMessages") &&
            (!ts.isIdentifier(element.name) || element.name.text !== name)
          )
            finding(
              element.name,
              "wallet authentication capability may not be aliased",
              name,
            );
        }
    }
    if (
      ts.isIdentifier(node) &&
      (node.text === "connectAnd" || node.text === "signMessages") &&
      !ts.isBindingElement(node.parent) &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node)
    )
      finding(
        node,
        "wallet authentication capability may only be called directly",
        node.text,
      );
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "connectAnd"
    )
      validateConnectAnd(node);
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "signMessages"
    )
      validateSignMessages(node);
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "console" &&
      ["log", "info", "warn", "error", "debug"].includes(
        node.expression.name.text,
      ) &&
      node.arguments.some(containsIdentityMessageMaterial)
    )
      finding(
        node,
        "identity message material in console output",
        node.expression.name.text,
      );
    ts.forEachChild(node, visit);
  }
  visit(source);
  return findings;
}

function envFindings() {
  const mobile = resolve(projectRoot, "mobile");
  const serverEnvironment = resolve(projectRoot, "server/.env");
  const serverSecrets = existsSync(serverEnvironment)
    ? readFileSync(serverEnvironment, "utf8")
        .split(/\r?\n/)
        .flatMap((line) => {
          const match = line.match(
            /^\s*(?:DATABASE_URL|SOLANA_MAINNET_RPC_URL)\s*=\s*(.*)$/,
          );
          return match?.[1]
            ? [match[1].trim().replace(/^['"]|['"]$/g, "")]
            : [];
        })
    : [];
  return readdirSync(mobile)
    .filter((name) => name === ".env" || name.startsWith(".env."))
    .flatMap((name) =>
      readFileSync(join(mobile, name), "utf8")
        .split(/\r?\n/)
        .flatMap((line, index) => {
          const match = line.match(
            /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
          );
          if (!match) return [];
          const key = match[1];
          const value = match[2].trim().replace(/^['"]|['"]$/g, "");
          const forbidden =
            /DATABASE|RPC|SECRET|PRIVATE|MNEMONIC|SEED|PASSWORD|TOKEN|KEY/i.test(
              key,
            ) ||
            (key.startsWith("EXPO_PUBLIC_") &&
              ![
                "EXPO_PUBLIC_API_URL",
                "EXPO_PUBLIC_SIWS_DOMAIN",
                "EXPO_PUBLIC_SIWS_URI",
              ].includes(key)) ||
            /postgres(?:ql)?:\/\/|-----BEGIN .*PRIVATE KEY-----/i.test(value) ||
            serverSecrets.some((secret) => secret && value.includes(secret)) ||
            (() => {
              try {
                const url = new URL(value);
                return !!(
                  url.username ||
                  url.password ||
                  url.search ||
                  url.hash
                );
              } catch {
                return false;
              }
            })();
          return forbidden
            ? [
                {
                  file: join(mobile, name),
                  line: index + 1,
                  rule: "mobile environment secret/capability",
                  name: key,
                },
              ]
            : [];
        }),
    );
}

function databaseFindings() {
  const files = [
    resolve(projectRoot, "server/prisma/schema.prisma"),
    ...walk(resolve(projectRoot, "server/prisma/migrations")),
  ];
  const pattern =
    /\b(seed_?phrase|mnemonic|private_?key|secret_?key|seed_?vault_?secret_?key)\b/gi;
  return files.flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return [...text.matchAll(pattern)].map((match) => ({
      file,
      line: text.slice(0, match.index).split(/\r?\n/).length,
      rule: "wallet secret database field",
      name: match[1],
    }));
  });
}

function runtimeFindings() {
  const files = [
    ...walk(resolve(projectRoot, "mobile/src")),
    ...walk(resolve(projectRoot, "mobile/plugins")),
    resolve(projectRoot, "mobile/index.js"),
    resolve(projectRoot, "mobile/polyfill.js"),
    resolve(projectRoot, "mobile/app.config.ts"),
    ...walk(resolve(projectRoot, "server/src")),
    ...walk(resolve(projectRoot, "server/scripts")),
    resolve(projectRoot, "server/prisma/seed.ts"),
  ];
  return [
    ...files.flatMap((file) => scanSource(readFileSync(file, "utf8"), file)),
    ...envFindings(),
    ...databaseFindings(),
  ];
}

function selfTest() {
  const dangerous = [...forbiddenFundIdentifiers, ...forbiddenSecretFields];
  const missed = dangerous.filter(
    (name) =>
      !scanSource(`const x = wallet.${name};`, "mobile/src/fixture.ts").length,
  );
  const unexpected = scanSource(
    "const { account, chain, connect, connectAnd, disconnect, signIn, signMessages } = useMobileWallet();",
    "mobile/src/fixture.ts",
  );
  const safeCapabilityRead = scanSource(
    "connectAnd(async wallet => { await wallet.getCapabilities(); });",
    "mobile/src/fixture.ts",
  );
  const escapedWallet = scanSource(
    "connectAnd(async wallet => { inspect(wallet); });",
    "mobile/src/fixture.ts",
  );
  const aliasedCapabilityRead = scanSource(
    "const { connectAnd: inspectWallet } = useMobileWallet();",
    "mobile/src/fixture.ts",
  );
  const aliasedMessageSigning = scanSource(
    "const { signMessages: signAnything } = useMobileWallet();",
    "mobile/src/fixture.ts",
  );
  const safeAuthenticationMessage = scanSource(
    "signMessages(canonicalMessageBytes);",
    "mobile/src/fixture.ts",
  );
  const unsafeMessage = scanSource(
    "signMessages(arbitraryBytes);",
    "mobile/src/fixture.ts",
  );
  const leakedIdentityMessage = scanSource(
    "console.info(canonicalMessageBytes);",
    "mobile/src/fixture.ts",
  );
  if (
    missed.length ||
    unexpected.length ||
    safeCapabilityRead.length ||
    safeAuthenticationMessage.length ||
    !escapedWallet.length ||
    !aliasedCapabilityRead.length ||
    !aliasedMessageSigning.length ||
    !unsafeMessage.length ||
    leakedIdentityMessage.length !== 1
  )
    throw new Error("Security scanner self-test failed.");
  console.info(
    `Wallet safety scanner self-test PASS (${dangerous.length} forbidden identifiers + strict wallet allowlist).`,
  );
}

try {
  if (process.argv.includes("--self-test")) selfTest();
  else {
    selfTest();
    const findings = runtimeFindings();
    console.info("FAIRCLAIM WALLET FUND SAFETY");
    console.info(
      "Wallet capability allowlist  " +
        (findings.length
          ? "FAIL"
          : "PASS — SIWS/canonical signMessages plus read-only capability inspection"),
    );
    console.info(
      "Asset transaction APIs       " +
        (findings.length
          ? "CHECK FINDINGS"
          : "PASS — none in first-party runtime"),
    );
    console.info(
      "Wallet secret fields         " +
        (findings.length
          ? "CHECK FINDINGS"
          : "PASS — absent from runtime/API/database schema"),
    );
    console.info(
      "Mobile server secrets        " +
        (findings.length
          ? "CHECK FINDINGS"
          : "PASS — environment/runtime clean"),
    );
    if (findings.length) {
      for (const item of findings)
        console.error(
          `${relative(projectRoot, item.file)}:${item.line} ${item.rule}: ${item.name}`,
        );
      console.error("WALLET FUND SAFETY: FAIL");
      process.exitCode = 1;
    } else console.info("WALLET FUND SAFETY: PASS");
  }
} catch {
  console.error("WALLET FUND SAFETY: FAIL — scanner could not complete");
  process.exitCode = 1;
}
