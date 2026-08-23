import React, { useMemo } from 'react';
import { Linking, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Check } from 'lucide-react-native';
import { Text } from '../../../shared/ui/Text';
import { clay, shade } from '../../../shared/theme/clay';
import { fontFor } from '../../../shared/theme/fonts';
import { splitBlocks } from '../services/markdown';

/**
 * A note read as a document rather than as raw text.
 *
 * Task lines are pulled out of the Markdown before it reaches the renderer and
 * drawn here instead. Two reasons: markdown-it has no task-list support without
 * a plugin, so `- [ ] thing` would otherwise render as the literal text
 * "[ ] thing" in a bullet; and a checkbox has to be a 44px touch target that
 * reports *which* task was hit. Splitting on the line gives both, and it keeps
 * the tap and `toggleTaskAt` counting tasks the same way — top to bottom, in
 * reading order.
 */

interface MarkdownViewProps {
  content: string;
  /** The note's paper colour. Every tone here is derived from it. */
  paperBg: string;
  textColor: string;
  mutedColor: string;
  accent: string;
  onAccent: string;
  onToggleTask: (taskIndex: number) => void;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({
  content,
  paperBg,
  textColor,
  mutedColor,
  accent,
  onAccent,
  onToggleTask,
}) => {
  const blocks = useMemo(() => splitBlocks(content), [content]);
  const styles = useMemo(
    () => markdownStyles(content, paperBg, textColor, mutedColor, accent),
    [content, paperBg, textColor, mutedColor, accent]
  );

  if (content.trim() === '') {
    return (
      <Text style={{ fontSize: 17, lineHeight: 28, color: mutedColor }}>
        Nothing written down yet.
      </Text>
    );
  }

  return (
    <View>
      {blocks.map((block) =>
        block.kind === 'markdown' ? (
          <Markdown
            key={block.key}
            style={styles}
            onLinkPress={(url) => {
              Linking.openURL(url).catch(() => undefined);
              return false;
            }}
          >
            {block.text}
          </Markdown>
        ) : (
          <TouchableOpacity
            key={block.key}
            onPress={() => onToggleTask(block.taskIndex)}
            activeOpacity={0.8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: block.checked }}
            accessibilityLabel={block.label}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              minHeight: 44,
              paddingVertical: 6,
            }}
          >
            <View
              style={{
                ...clay({
                  color: block.checked ? accent : shade(paperBg, -0.08),
                  radius: 8,
                  depth: 0.4,
                  pressed: !block.checked,
                }),
                width: 24,
                height: 24,
                marginTop: 3,
                marginRight: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {block.checked && <Check size={15} color={onAccent} strokeWidth={3} />}
            </View>
            <Text
              style={{
                flex: 1,
                fontSize: 17,
                lineHeight: 26,
                color: block.checked ? mutedColor : textColor,
                textDecorationLine: block.checked ? 'line-through' : 'none',
              }}
            >
              {block.label}
            </Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
};

/**
 * Document typography for the renderer.
 *
 * The family is picked from the note's own text — React Native has no
 * per-glyph fallback, so an Arabic note has to be handed the Arabic face for
 * the whole block or Android draws boxes.
 */
function markdownStyles(
  content: string,
  paperBg: string,
  ink: string,
  muted: string,
  accent: string
) {
  const fontFamily = fontFor(content);
  const rule = shade(paperBg, -0.14);
  const well = shade(paperBg, -0.08);

  return {
    body: { fontFamily, fontSize: 17, lineHeight: 28, color: ink },
    heading1: { fontFamily, fontSize: 26, fontWeight: '700' as const, lineHeight: 34, marginTop: 8 },
    heading2: { fontFamily, fontSize: 21, fontWeight: '700' as const, lineHeight: 29, marginTop: 8 },
    heading3: { fontFamily, fontSize: 18, fontWeight: '700' as const, lineHeight: 26, marginTop: 6 },
    strong: { fontWeight: '700' as const },
    em: { fontStyle: 'italic' as const },
    s: { textDecorationLine: 'line-through' as const, color: muted },
    link: { color: accent, textDecorationLine: 'underline' as const },
    blockquote: {
      backgroundColor: well,
      borderRadius: 12,
      borderLeftWidth: 4,
      borderLeftColor: rule,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginVertical: 6,
    },
    hr: { backgroundColor: rule, height: 2, marginVertical: 16 },
    code_inline: { fontFamily: 'monospace', backgroundColor: well, borderRadius: 6, color: ink },
    code_block: { fontFamily: 'monospace', backgroundColor: well, borderColor: rule, borderRadius: 14, color: ink },
    fence: { fontFamily: 'monospace', backgroundColor: well, borderColor: rule, borderRadius: 14, color: ink },
    bullet_list: { marginVertical: 2 },
    ordered_list: { marginVertical: 2 },
    list_item: { marginVertical: 2 },
    paragraph: { marginTop: 4, marginBottom: 8 },
  };
}
