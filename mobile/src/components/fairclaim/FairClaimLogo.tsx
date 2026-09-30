import Svg, { Path } from 'react-native-svg'
import type { ColorValue } from 'react-native'

const LEFT_BODY = 'M100 310 440 110 440 360 320 430 320 570 440 640 440 890 100 690Z'
const RIGHT_BODY = 'M900 310 560 110 560 360 680 430 680 570 560 640 560 890 900 690Z'
const HEX_RING = 'M500 354 664.25 445.25 664.25 554.75 500 646 335.75 554.75 335.75 445.25Z'
const VERIFY_CORE = 'M500 406.5 602.85 462.6 602.85 537.4 500 593.5 397.15 537.4 397.15 462.6Z'

export function FairClaimLogo({
  size = 40,
  monochrome = false,
  outerColor = '#F5F7FA',
}: {
  size?: number
  monochrome?: boolean
  outerColor?: ColorValue
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1000 1000" accessibilityLabel="FairClaim Geometry Master mark">
      <Path d={LEFT_BODY} fill={outerColor} />
      <Path d={RIGHT_BODY} fill={outerColor} />
      <Path d={HEX_RING} fill="#05070B" />
      <Path d={VERIFY_CORE} fill={monochrome ? '#F5F7FA' : '#68F5C2'} />
    </Svg>
  )
}

export function FairClaimRouteIcon({ size = 24, color = '#38DCF2' }: { size?: number; color?: ColorValue }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1000 1000" accessibilityLabel="FairClaim route">
      <Path d={LEFT_BODY} fill={color} />
      <Path d={RIGHT_BODY} fill={color} />
      <Path d={HEX_RING} fill="#05070B" />
      <Path d={VERIFY_CORE} fill={color} />
    </Svg>
  )
}
