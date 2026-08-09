import type { ViewStyle } from 'react-native';
import type { Palette } from './index';

/**
 * Claymorphism / skeuomorphism helpers.
 *
 * Clay reads as a soft object pressed out of the page: a big radius, a wide
 * diffuse drop shadow, a light rim along the top edge and a darker rim along
 * the bottom. React Native has no inset box-shadow that works on every
 * platform, so the "inner" lighting is faked with asymmetric border colours —
 * that renders identically on iOS, Android and web instead of only where the
 * New Architecture is on.
 */

/** Blend a hex colour toward white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean;

  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);

  const mixed = [0, 2, 4].map((i) => {
    const channel = parseInt(full.slice(i, i + 2), 16);
    return Math.round(channel + (target - channel) * t);
  });

  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export interface ClayOptions {
  /** Surface colour the clay is moulded from. */
  color: string;
  radius?: number;
  /** Pressed-in instead of pushed-out: flips the rim lighting and drops the shadow. */
  pressed?: boolean;
  /** Shadow strength multiplier; raise it for floating elements. */
  depth?: number;
}

export function clay({ color, radius = 22, pressed = false, depth = 1 }: ClayOptions): ViewStyle {
  return {
    backgroundColor: color,
    borderRadius: radius,
    borderWidth: 1.5,
    // Light catches the top edge on a raised object and the bottom edge on a
    // hollow one — that inversion is what sells "pressed in".
    borderTopColor: shade(color, pressed ? -0.16 : 0.28),
    borderLeftColor: shade(color, pressed ? -0.1 : 0.18),
    borderRightColor: shade(color, pressed ? 0.1 : -0.12),
    borderBottomColor: shade(color, pressed ? 0.18 : -0.2),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: pressed ? 1 : 8 * depth },
    shadowOpacity: pressed ? 0.08 : 0.18 * depth,
    shadowRadius: pressed ? 2 : 16 * depth,
    elevation: pressed ? 1 : 8 * depth,
  };
}

/** A raised clay button in the accent colour, for primary actions. */
export function clayAccent(colors: Palette, radius = 20): ViewStyle {
  return clay({ color: colors.accent, radius, depth: 1.2 });
}

/** A clay panel that sits on the canvas: sheets, cards, headers. */
export function claySurface(colors: Palette, radius = 24): ViewStyle {
  return clay({ color: colors.surface, radius });
}
