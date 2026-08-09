import React from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { FONTS, hasArabic, textOf } from '../theme/fonts';
import { useTheme } from '../theme';

/**
 * Drop-in replacement for react-native's Text that applies the hand-drawn
 * font, choosing the family from the script the text is written in.
 *
 * React Native does not inherit fontFamily from a parent View, so there is no
 * "set it once globally" option — every Text has to carry it. Routing the whole
 * app through this component is the one place to do that.
 *
 * Arabic always gets its own face regardless of the hand-drawn toggle — that's
 * about script support, not about the rough Excalidraw look.
 *
 * An explicit fontFamily in `style` still wins, so a caller can opt out.
 */
export const Text: React.FC<TextProps> = ({ style, children, ...rest }) => {
  const { handDrawnEnabled } = useTheme();
  const text = textOf(children);
  const fontFamily = hasArabic(text) ? FONTS.arabic : handDrawnEnabled ? FONTS.hand : undefined;

  return (
    <RNText style={[{ fontFamily }, style]} {...rest}>
      {children}
    </RNText>
  );
};
