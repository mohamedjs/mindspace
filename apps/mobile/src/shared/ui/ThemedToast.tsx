import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import Toast, { ToastConfig, ToastProps } from 'react-native-toast-message';
import { Text } from './Text';
import { useTheme } from '../theme';
import { clay } from '../theme/clay';

export function ThemedToast() {
  const { colors } = useTheme();

  const BaseToast = ({ text1, text2, props, type }: { text1?: string; text2?: string; props?: any; type?: 'success' | 'error' | 'info' }) => {
    // Optionally change border or accent color based on type
    const accentColor = type === 'error' ? '#C6453C' : type === 'success' ? '#4CAF50' : colors.accent;

    return (
      <View
        className="mx-6 w-[90%] flex-row items-center rounded-[24px] px-5 py-4"
        style={{
          backgroundColor: colors.overlay,
          borderWidth: 1,
          borderColor: colors.line,
          ...clay({ color: colors.overlay, radius: 24, depth: 0.8 }),
        }}
      >
        <View className="flex-1">
          {Boolean(text1) && <Text className="text-base font-bold text-ink">{text1}</Text>}
          {Boolean(text2) && <Text className="mt-0.5 text-[13px] font-medium text-muted">{text2}</Text>}
        </View>
        {props?.onRetry && (
          <TouchableOpacity onPress={props.onRetry} hitSlop={10}>
            <Text className="ml-3 text-sm font-bold" style={{ color: accentColor }}>
              Retry
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const toastConfig: ToastConfig = {
    success: (props) => <BaseToast {...props} type="success" />,
    error: (props) => <BaseToast {...props} type="error" />,
    info: (props) => <BaseToast {...props} type="info" />,
  };

  return <Toast config={toastConfig} />;
}
