import React from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { fontFor, textOf } from '../theme/fonts';

/**
 * Drop-in replacement for react-native's Text that applies the hand-drawn
 * font, choosing the family from the script the text is written in.
 *
 * React Native does not inherit fontFamily from a parent View, so there is no
 * "set it once globally" option — every Text has to carry it. Routing the whole
 * app through this component is the one place to do that.
 *
 * An explicit fontFamily in `style` still wins, so a caller can opt out.
 */
export const Text: React.FC<TextProps> = ({ style, children, ...rest }) => (
  <RNText style={[{ fontFamily: fontFor(textOf(children)) }, style]} {...rest}>
    {children}
  </RNText>
);
