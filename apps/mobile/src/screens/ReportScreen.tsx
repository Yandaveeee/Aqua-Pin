import { fetchWithTimeout } from '../lib/network';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import ChatMarkdown from '../components/ChatMarkdown';
import { assistantSnapshot, Conversation, conversationKey, readConversations, newConversation } from '../lib/assistant';
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  Alert,
  Dimensions,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { usePonds } from '../hooks/useOfflineData';
import { aquapinColors } from '../theme/aquapin';
import { CONFIG } from '../config';

const AI_API_URL = `${CONFIG.supabase.url}/functions/v1/ai-chat`;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isError?: boolean;
}

const SUGGESTED_QUESTIONS = [
  'How many ponds do I have registered?',
  'Give me tips on improving water quality',
  'When is the best time to harvest?',
  'How to reduce fish mortality?',
];

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content: 'Hello! I\'m your AquaPin AI Assistant. I can help you with pond management, harvest optimization, water quality advice, and more.\n\nWhat would you like to know?',
  timestamp: new Date(),
};

export default function ReportScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState('');
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const persistence = useRef(Promise.resolve());
  const abortRef = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; abortRef.current?.abort(); }; }, []);
  useEffect(() => {
    let current = true;
    if (!user) return;
    AsyncStorage.getItem(conversationKey(user.id)).then(raw => {
      if (!current) return;
      const stored = readConversations(raw);
      const chats = stored.length ? stored : [newConversation(WELCOME_MESSAGE)];
      setConversations(chats); setActiveId(chats[0].id); setMessages(chats[0].messages); setHistoryReady(true);
    }).catch(() => { if (current) setStorageError('Unable to load conversation history. Reopen the assistant to retry.'); });
    return () => { current = false; };
  }, [user?.id]);
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const { ponds } = usePonds();
  const scrollViewRef = useRef<ScrollView>(null);
  const requestInFlight = useRef(false);

  useEffect(() => {
    if (!historyReady || !user || !activeId) return;
    const updated = conversations.map(c => c.id === activeId ? { ...c, messages, title: messages.find(m => m.role === 'user')?.content.slice(0, 65) || 'New Chat' } : c);
    const key = conversationKey(user.id);
    persistence.current = persistence.current.catch(() => {}).then(() => AsyncStorage.setItem(key, JSON.stringify(updated)))
      .then(() => { if (alive.current) setStorageError(''); })
      .catch(() => { if (alive.current) setStorageError('Unable to save conversation history. Keep this screen open and try again.'); });
  }, [messages, activeId, historyReady, user?.id, conversations]);
  const switchConversation = (chat?: Conversation) => {
    if (requestInFlight.current || !historyReady) return;
    const next = chat || newConversation(WELCOME_MESSAGE);
    setConversations(previous => {
      const updated = previous.map(c => c.id === activeId ? { ...c, messages, title: messages.find(m => m.role === 'user')?.content.slice(0, 65) || 'New Chat' } : c);
      return chat ? updated : [next, ...updated];
    });
    setActiveId(next.id); setMessages(next.messages); setInputText(''); setHistoryVisible(false);
  };

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        setKeyboardVisible(true);
        const windowHeight = Dimensions.get('window').height;
        const keyboardTop = event.endCoordinates?.screenY ?? windowHeight;
        const overlap = Math.max(0, windowHeight - keyboardTop);
        setKeyboardOffset(Platform.OS === 'ios' ? 0 : overlap);
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
        setKeyboardOffset(0);
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, loading]);

  const sendMessage = async (text: string, retry = false) => {
    if (!text.trim() || requestInFlight.current || !historyReady || !user) return;
    requestInFlight.current = true;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    const history = retry ? messages.slice(0, -2) : messages;
    setMessages([...history, userMessage]);
    setInputText('');
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 55000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please sign in again to use AquaPin AI.');
      const snapshot = await assistantSnapshot(user.id).catch(() => ({ source: 'Local records unavailable. Do not invent data.' }));
      const response = await fetchWithTimeout(AI_API_URL, {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: CONFIG.supabase.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, language, snapshot, history: history.filter(m => !m.isError && m.id !== 'welcome').slice(-20).map(m => ({ role: m.role, content: m.content })) }),
      }, 55000);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('AI service access was denied. Please contact your administrator.');
        }
        if (response.status === 404) {
          throw new Error('AquaPin AI is not deployed yet. Please contact your administrator.');
        }
        if (response.status === 429) {
          throw new Error('AI usage limit reached. Please wait a moment and try again.');
        }
        throw new Error(`AI service is unavailable (error ${response.status}). Please try again later.`);
      }

      const data = await response.json();
      const aiResponse = data.content;
      if (typeof aiResponse !== 'string' || !aiResponse.trim()) {
        throw new Error('The AI returned an empty response. Please try again.');
      }

      if (!alive.current) return;
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
      }]);
    } catch (error) {
      if (!alive.current) return;
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: controller.signal.aborted
          ? 'AI took too long to respond. Please try again.'
          : error instanceof TypeError
            ? 'Could not connect to the AI service. Check your internet connection and try again.'
            : error instanceof SyntaxError
              ? 'The AI service returned an invalid response. Please try again later.'
              : error instanceof Error
                ? error.message
                : 'AI chat is unavailable. Please try again later.',
        isError: true,
        timestamp: new Date(),
      }]);
    } finally {
      clearTimeout(timeout);
      requestInFlight.current = false;
      if (alive.current) setLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const clearConversation = () => {
    if (messages.length <= 1 || requestInFlight.current) return;

    Alert.alert(
      'Clear Conversation',
      'This will remove all messages except the welcome note.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            if (requestInFlight.current) return;
            setMessages([{ ...WELCOME_MESSAGE, timestamp: new Date() }]);
            setInputText('');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity style={styles.backButton} activeOpacity={0.9} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={22} color={aquapinColors.text} />
            </TouchableOpacity>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>AquaPin AI</Text>
              <Text style={styles.subtitle}>{t('Your aquaculture assistant')}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.pondBadge}>
              <Text style={styles.pondCount}>{ponds.length}</Text>
              <Text style={styles.pondLabel}>ponds</Text>
            </View>
            <TouchableOpacity
              style={[styles.clearButton, messages.length <= 1 && styles.clearButtonDisabled]}
              onPress={clearConversation}
              disabled={messages.length <= 1 || loading}
            >
              <Ionicons name="trash-outline" size={16} color={messages.length <= 1 ? '#9ca3af' : '#666'} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 8 }}>
          {[['New Chat', () => switchConversation()], ['Conversation History', () => setHistoryVisible(true)], ['Clear Chat', clearConversation]].map(([label, action]) => (
            <TouchableOpacity key={String(label)} accessibilityRole="button" disabled={loading || !historyReady} onPress={action as () => void} style={{ padding: 12, backgroundColor: '#e3f2fd', borderRadius: 12, opacity: loading ? 0.5 : 1 }}><Text>{t(String(label))}</Text></TouchableOpacity>
          ))}
        </View>
        {!historyReady && !storageError && <ActivityIndicator accessibilityLabel="Loading conversation history" />}
        {!!storageError && <Text accessibilityRole="alert" style={{ color: '#b91c1c', padding: 12 }}>{storageError}</Text>}
        <Modal visible={historyVisible} onRequestClose={() => setHistoryVisible(false)} animationType="slide">
          <SafeAreaView style={{ flex: 1, padding: 20 }}><Text style={styles.title}>{t('Conversation History')}</Text>
            <TouchableOpacity onPress={() => setHistoryVisible(false)} style={{ padding: 16 }}><Text>Close</Text></TouchableOpacity>
            <ScrollView>{conversations.map(c => <TouchableOpacity key={c.id} onPress={() => switchConversation(c.id === activeId ? { ...c, messages } : c)} style={{ padding: 16, borderBottomWidth: 1, borderColor: '#ddd' }}><Text>{c.id === activeId ? messages.find(m => m.role === 'user')?.content.slice(0, 65) || t('New Chat') : c.title}</Text><Text>{c.messages[0]?.timestamp.toLocaleString()}</Text></TouchableOpacity>)}</ScrollView>
          </SafeAreaView>
        </Modal>
        <View style={[styles.chatArea, { paddingBottom: keyboardOffset }]}>
          {/* Messages */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageBubble,
                  message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                ]}
              >
                <View style={styles.messageHeader}>
                  <Ionicons
                    name={message.role === 'user' ? 'person-circle' : 'hardware-chip'}
                    size={18}
                    color={message.role === 'user' ? '#fff' : '#007bff'}
                  />
                  <Text style={[styles.messageRole, message.role === 'user' ? styles.userRole : styles.assistantRole]}>
                    {message.role === 'user' ? 'You' : 'AquaPin AI'}
                  </Text>
                  <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>
                </View>
                {message.role === 'assistant' ? <ChatMarkdown content={message.content} /> : <Text style={[styles.messageText, styles.userText]}>{message.content}</Text>}
                {message.isError && message.id === messages[messages.length - 1]?.id && <TouchableOpacity disabled={loading} style={{ padding: 12 }} onPress={() => { const previous = messages[messages.length - 2]; if (previous?.role === 'user') void sendMessage(previous.content, true); }}><Text>{t('Retry Response')}</Text></TouchableOpacity>}

              </View>
            ))}

            {loading && (
              <View style={styles.loadingBubble}>
                <ActivityIndicator size="small" color="#007bff" />
                <Text style={styles.loadingText}>AI is thinking...</Text>
              </View>
            )}
          </ScrollView>

          <View style={[styles.inputSection, keyboardVisible && styles.inputSectionKeyboard]}>
            {!inputText && !loading && !keyboardVisible && (
              <View style={styles.suggestionsWrapper}>
                <Text style={styles.suggestionsLabel}>Quick Questions:</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
                >
                  {SUGGESTED_QUESTIONS.map((question, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.suggestionChip}
                      onPress={() => sendMessage(question)}
                    >
                      <Text style={styles.suggestionText}>{question}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={[styles.inputWrapper, { paddingBottom: keyboardVisible ? 6 : Math.max(12, insets.bottom + 8) }]}>
              <View style={styles.composer}>
                <TextInput
                  style={styles.input}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder={t('Ask about your ponds...')}
                  placeholderTextColor="#94a3b8"
                  multiline
                  maxLength={500}
                  returnKeyType="send"
                  onSubmitEditing={() => sendMessage(inputText)}
                  blurOnSubmit={false}
                  editable={!loading}
                  onFocus={() => {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 100);
                  }}
                />
                <TouchableOpacity
                  style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
                  onPress={() => sendMessage(inputText)}
                  disabled={!inputText.trim() || loading || !historyReady}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="arrow-up" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.disclaimer}>
                AquaPin AI can make mistakes. Always verify important information.
              </Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  keyboardAvoidingContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e4e8',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: aquapinColors.surface,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  pondBadge: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  pondCount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007bff',
  },
  pondLabel: {
    fontSize: 11,
    color: '#007bff',
  },
  clearButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f1f3f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  clearButtonDisabled: {
    backgroundColor: '#f3f4f6',
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 18,
  },
  chatArea: {
    flex: 1,
  },
  messageBubble: {
    maxWidth: '90%',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007bff',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    width: '90%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e1e4e8',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  messageRole: {
    fontSize: 12,
    fontWeight: '600',
  },
  userRole: {
    color: 'rgba(255,255,255,0.8)',
  },
  assistantRole: {
    color: '#007bff',
  },
  timestamp: {
    fontSize: 11,
    color: '#999',
    marginLeft: 'auto',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userText: {
    color: '#fff',
  },
  assistantText: {
    color: '#333',
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#f0f7ff',
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#007bff',
  },
  inputSection: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
  },
  inputSectionKeyboard: {
    borderTopColor: 'transparent',
  },
  suggestionsWrapper: {
    paddingTop: 8,
    paddingBottom: 6,
  },
  suggestionsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  suggestionChip: {
    backgroundColor: '#e3f2fd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#007bff',
  },
  suggestionText: {
    fontSize: 13,
    color: '#007bff',
    fontWeight: '500',
  },
  inputWrapper: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  composer: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#dbe5ef',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  input: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 0,
    paddingVertical: Platform.OS === 'ios' ? 9 : 7,
    fontSize: 15,
    color: '#1a1a1a',
    maxHeight: 108,
    textAlignVertical: 'center',
  },
  sendButton: {
    width: 40,
    height: 40,
    backgroundColor: '#007bff',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007bff',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  sendButtonDisabled: {
    backgroundColor: '#d6dde6',
    shadowOpacity: 0,
    elevation: 0,
  },
  disclaimer: {
    marginTop: 5,
    fontSize: 10.5,
    lineHeight: 14,
    color: '#9aa4b2',
    textAlign: 'center',
  },
});
