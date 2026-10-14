import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// Native text only: model output can never execute HTML or JavaScript.
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g).map((part, i) => {
    if (/^(\*\*|__)/.test(part)) return <Text key={i} style={styles.bold}>{part.slice(2, -2)}</Text>;
    if (part.startsWith('`')) return <Text key={i} style={styles.code}>{part.slice(1, -1)}</Text>;
    if (/^[*_]/.test(part) && part.length > 2) return <Text key={i} style={styles.italic}>{part.slice(1, -1)}</Text>;
    return part;
  });
}
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(s => s.trim().replace(/\\\|/g, '|'));
const separator = (line: string) => cells(line).every(c => /^:?-{3,}:?$/.test(c));
export default function ChatMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
      blocks.push(<ScrollView horizontal key={i}><Text selectable style={[styles.text, styles.code]}>{code.join('\n')}</Text></ScrollView>);
    } else if (line.includes('|') && i + 1 < lines.length && separator(lines[i + 1])) {
      const rows = [cells(line)]; i++;
      while (i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].trim()) rows.push(cells(lines[++i]));
      blocks.push(<ScrollView key={i} horizontal style={styles.tableScroll} accessibilityLabel="Table. Scroll horizontally to read all columns.">
        <View>{rows.map((row, r) => <View key={r} style={[styles.row, r === 0 && styles.header]}>{row.map((cell, c) => <Text key={c} selectable style={[styles.cell, r === 0 && styles.bold]}>{inline(cell)}</Text>)}</View>)}</View>
      </ScrollView>);
    } else {
      const heading = /^(#{1,6})\s+(.*)$/.exec(line);
      const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
      blocks.push(<Text key={i} selectable accessibilityRole={heading ? 'header' : undefined} style={[styles.text, heading && styles.heading]}>{inline(heading ? heading[2] : bullet ? `• ${bullet[1]}` : line)}</Text>);
    }
  }
  return <View style={styles.root}>{blocks}</View>;
}
const styles = StyleSheet.create({
  root: { maxWidth: '100%', flexShrink: 1 }, text: { fontSize: 15, lineHeight: 22, color: '#243447' },
  bold: { fontWeight: '700' }, italic: { fontStyle: 'italic' }, heading: { fontSize: 18, fontWeight: '700', marginVertical: 8 },
  code: { fontFamily: 'monospace', backgroundColor: '#edf2f7', padding: 4 },
  tableScroll: { maxWidth: '100%', marginVertical: 8 }, row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#dbe5ef' },
  header: { backgroundColor: '#e3f2fd' }, cell: { width: 150, padding: 10, fontSize: 14, lineHeight: 20, color: '#243447' },
});
