import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fontFamily, radius, spacing, typeScale } from '../../theme/theme';
import type { CaseNote } from '../../types/domain';
import { Button } from '../Button';

interface NotesThreadProps {
  notes: CaseNote[];
  onSend: (body: string) => Promise<void>;
  sending: boolean;
}

/**
 * Backend confirmed: a dentist_client's note is always forced to
 * visibility='portal' server-side, and GET .../notes already filters to
 * portal-only for this role — so every note this screen ever receives or
 * sends is client-visible by construction. No client-side visibility
 * toggle or filter needed.
 */
export function NotesThread({ notes, onSend, sending }: NotesThreadProps) {
  const [draft, setDraft] = useState('');

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) return;
    await onSend(body);
    setDraft('');
  };

  return (
    <View style={styles.container}>
      {notes.length === 0 ? (
        <Text style={styles.empty}>No notes yet.</Text>
      ) : (
        <View style={styles.list}>
          {notes.map((note) => (
            <View key={note.id} style={styles.bubble}>
              <Text style={styles.body}>{note.body}</Text>
              <Text style={styles.timestamp}>
                {new Date(note.created_at).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a note…"
          placeholderTextColor={colors.inkSoft}
          multiline
        />
        <Button
          label="Send"
          onPress={handleSend}
          loading={sending}
          disabled={draft.trim().length === 0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  list: { gap: spacing.sm },
  bubble: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  body: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.body,
    color: colors.ink,
  },
  timestamp: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.caption,
    color: colors.inkSoft,
    marginTop: spacing.xs,
  },
  empty: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.bodySmall,
    color: colors.inkSoft,
  },
  composer: { gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 44,
    fontFamily: fontFamily.bodyRegular,
    fontSize: typeScale.body,
    color: colors.ink,
    backgroundColor: colors.card,
  },
});
