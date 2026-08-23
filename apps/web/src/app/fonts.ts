import { Architects_Daughter, Baloo_Bhaijaan_2 } from 'next/font/google';

export const architectsDaughter = Architects_Daughter({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-hand',
  display: 'swap',
});

export const baloo = Baloo_Bhaijaan_2({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin', 'arabic'],
  variable: '--font-ui',
  display: 'swap',
});
