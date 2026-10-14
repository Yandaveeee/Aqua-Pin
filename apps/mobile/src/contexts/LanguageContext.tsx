import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LANGUAGES = [{ code: 'en', label: 'English' }, { code: 'fil', label: 'Filipino' }] as const;
export type Language = typeof LANGUAGES[number]['code'];
export const PROFILE_PREFS_KEY = '@aquapin_profile_preferences';
const translations: Record<string, string> = {
  Dashboard: 'Pangkalahatan', Ponds: 'Mga Palaisdaan', Records: 'Mga Talaan', Profile: 'Propayl',
  'Account Preferences': 'Mga Kagustuhan ng Account', Language: 'Wika',
  'Save Changes': 'I-save ang mga Pagbabago', 'Saving...': 'Sine-save...',
  'Preferences saved.': 'Na-save ang mga kagustuhan.',
  'New Chat': 'Bagong Usapan', 'Conversation History': 'Mga Nakaraang Usapan',
  'Clear Chat': 'Burahin ang Usapan', 'Retry Response': 'Subukang Muli',
  'Your aquaculture assistant': 'Ang iyong katulong sa aquaculture',
  'Ask about your ponds...': 'Magtanong tungkol sa iyong palaisdaan...',
  'Sync Now': 'I-sync Ngayon', 'Syncing...': 'Nagsi-sync...',
};
const Context = createContext({ language: 'en' as Language, applyLanguage: (_: Language) => {}, t: (text: string) => text });
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, applyLanguage] = useState<Language>('en');
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(PROFILE_PREFS_KEY).then(raw => {
      const code = raw ? JSON.parse(raw).language : 'en';
      if (active && LANGUAGES.some(item => item.code === code)) applyLanguage(code);
    }).catch(error => console.warn('Unable to restore language', error));
    return () => { active = false; };
  }, []);
  return <Context.Provider value={{ language, applyLanguage, t: text => language === 'fil' ? translations[text] || text : text }}>{children}</Context.Provider>;
}
export const useLanguage = () => useContext(Context);
