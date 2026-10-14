import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

export default class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('AquaPin screen error', error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: '#f8f9fa' }}>
      <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: '700' }}>Unable to open this screen</Text>
      <Text>Your saved pond records are kept. Please try opening AquaPin again.</Text>
      <TouchableOpacity accessibilityRole="button" style={{ padding: 16, borderRadius: 12, backgroundColor: '#007bff' }} onPress={() => this.setState({ failed: false })}><Text style={{ color: '#fff', fontWeight: '700' }}>Try Again</Text></TouchableOpacity>
    </View>;
  }
}
