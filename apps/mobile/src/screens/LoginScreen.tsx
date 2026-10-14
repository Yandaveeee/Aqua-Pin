import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
  Image,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useAppearance } from '../contexts/AppearanceContext';
import { supabase } from '../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password: string): string | null => {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a number';
  return null;
};

interface FormErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

type FocusField = 'fullName' | 'email' | 'password' | 'confirmPassword' | null;

export default function LoginScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [focusedField, setFocusedField] = useState<FocusField>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const { signIn, signUp } = useAuth();
  const { isDarkMode } = useAppearance();

  const fullNameInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    if (!cooldownUntil) {
      return;
    }

    setCurrentTime(Date.now());
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownUntil]);

  useEffect(() => {
    if (cooldownUntil && cooldownUntil <= currentTime) {
      setCooldownUntil(null);
    }
  }, [cooldownUntil, currentTime]);

  // Clean, instantaneous mode switch without screen blanking or flickering
  const handleModeSwitch = useCallback(
    (toSignUp: boolean) => {
      if (isSignUp === toSignUp) return;
      Keyboard.dismiss();
      setFocusedField(null);
      setErrors({});
      setIsSignUp(toSignUp);
    },
    [isSignUp]
  );

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    const normalizedFullName = fullName.trim().replace(/\s+/g, ' ');
    const normalizedEmail = email.trim().toLowerCase();

    if (isSignUp) {
      if (!normalizedFullName) {
        newErrors.fullName = 'Full name is required';
      } else if (normalizedFullName.length < 3 || normalizedFullName.length > 80) {
        newErrors.fullName = 'Enter a name between 3 and 80 characters';
      } else if (normalizedFullName.split(' ').length < 2) {
        newErrors.fullName = 'Please enter both your first and last name';
      }
    }

    if (!normalizedEmail) {
      newErrors.email = 'Email address is required';
    } else if (!validateEmail(normalizedEmail)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (isSignUp) {
      const passwordError = validatePassword(password);
      if (passwordError) newErrors.password = passwordError;
    }

    if (isSignUp) {
      if (!confirmPassword) {
        newErrors.confirmPassword = 'Confirm your password';
      } else if (confirmPassword !== password) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (loading || submitInFlightRef.current) {
      return;
    }

    if (isCooldownActive) {
      return;
    }

    if (!validateForm()) return;

    const normalizedEmail = email.trim().toLowerCase();

    submitInFlightRef.current = true;
    setLoading(true);
    try {
      if (isSignUp) {
        const { error, signedIn } = await signUp(
          normalizedEmail,
          password,
          fullName.trim().replace(/\s+/g, ' ')
        );
        if (error) {
          if (error.isRateLimit) {
            setCooldownUntil(Date.now() + (error.retryAfterSeconds || 60) * 1000);
          }
          Alert.alert('Registration Error', error.message);
        } else if (!signedIn) {
          Alert.alert(
            'Account Created',
            'Your account was created successfully. Please check your email for the verification link.',
            [
              {
                text: 'OK',
                onPress: () => handleModeSwitch(false),
                style: 'default',
              },
            ]
          );
        }
      } else {
        const { error } = await signIn(normalizedEmail, password);
        if (error) {
          if (error.isRateLimit) {
            setCooldownUntil(Date.now() + (error.retryAfterSeconds || 60) * 1000);
          }
          Alert.alert('Login Error', error.message);
        }
      }
    } finally {
      submitInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      Alert.alert(
        'Forgot Password',
        'Please enter your email address in the field above so we can send you password reset instructions.'
      );
      emailInputRef.current?.focus();
      return;
    }

    Alert.alert(
      'Reset Password',
      `Send a password reset link to ${normalizedEmail}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Link',
          onPress: async () => {
            try {
              setResetLoading(true);
              const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
                redirectTo: 'aquapin://auth/callback',
              });
              if (error) {
                Alert.alert('Reset Failed', error.message);
              } else {
                Alert.alert(
                  'Check Your Inbox',
                  `A password reset link has been dispatched to ${normalizedEmail}. Open the link to create a new password.`
                );
              }
            } catch (err: any) {
              Alert.alert('Reset Error', err?.message || 'Unable to send password reset request.');
            } finally {
              setResetLoading(false);
            }
          },
        },
      ]
    );
  };

  const getPasswordStrength = (): { strength: number; color: string; label: string } => {
    if (password.length === 0) return { strength: 0, color: 'transparent', label: '' };

    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2) return { strength: 0.33, color: '#ef4444', label: 'Weak' };
    if (score <= 4) return { strength: 0.66, color: '#f59e0b', label: 'Medium' };
    return { strength: 1, color: '#10b981', label: 'Strong' };
  };

  const passwordStrength = getPasswordStrength();
  const normalizedFullName = fullName.trim().replace(/\s+/g, ' ');
  const fullNameIsValid =
    normalizedFullName.length >= 3 &&
    normalizedFullName.length <= 80 &&
    normalizedFullName.split(' ').length >= 2;
  const normalizedEmail = email.trim();
  const confirmPasswordMatches = isSignUp && confirmPassword.length > 0 && confirmPassword === password;
  const remainingCooldownSeconds = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - currentTime) / 1000)) : 0;
  const isCooldownActive = remainingCooldownSeconds > 0;

  // Clean theme palette (no background orbs, simple & pure liquid glass)
  const theme = {
    bg: isDarkMode ? '#08121e' : '#ebf3fa',
    glassBg: isDarkMode ? 'rgba(15, 27, 44, 0.88)' : 'rgba(255, 255, 255, 0.86)',
    glassBorder: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.92)',
    glassHighlight: isDarkMode ? 'rgba(255, 255, 255, 0.20)' : 'rgba(255, 255, 255, 0.98)',
    shadowColor: isDarkMode ? '#000000' : '#0d2847',
    textPrimary: isDarkMode ? '#f8fafc' : '#0c2440',
    textSecondary: isDarkMode ? '#94a7bc' : '#556f8c',
    textMuted: isDarkMode ? '#607286' : '#889eb6',
    inputBg: isDarkMode ? 'rgba(10, 19, 32, 0.65)' : 'rgba(255, 255, 255, 0.72)',
    inputBorder: isDarkMode ? 'rgba(255, 255, 255, 0.10)' : 'rgba(195, 218, 238, 0.85)',
    inputFocusedBorder: isDarkMode ? '#38bdf8' : '#0284c7',
    inputFocusedBg: isDarkMode ? 'rgba(15, 29, 49, 0.95)' : '#ffffff',
    segmentedBg: isDarkMode ? 'rgba(9, 18, 30, 0.75)' : 'rgba(230, 241, 251, 0.85)',
    segmentedBorder: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(198, 220, 240, 0.75)',
    pillActiveBg: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : '#ffffff',
    pillActiveText: isDarkMode ? '#38bdf8' : '#0284c7',
    pillInactiveText: isDarkMode ? '#8fa3b7' : '#647d96',
    buttonBg: isSignUp
      ? isDarkMode ? '#059669' : '#0d9488'
      : isDarkMode ? '#0284c7' : '#0284c7',
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* SINGLE UNIFIED LIQUID GLASS CARD */}
          <View
            style={[
              styles.liquidGlassCard,
              {
                backgroundColor: theme.glassBg,
                borderColor: theme.glassBorder,
                shadowColor: theme.shadowColor,
              },
            ]}
          >
            {/* Top specular reflection strip for authentic Apple glass look */}
            <View
              style={[
                styles.glassSpecularReflection,
                { backgroundColor: theme.glassHighlight },
              ]}
            />

            {/* Prominent AquaPin Brand Header */}
            <View style={styles.brandHeader}>
              <View
                style={[
                  styles.brandLogoCircle,
                  {
                    backgroundColor: isDarkMode ? 'rgba(56, 189, 248, 0.12)' : 'rgba(2, 132, 199, 0.08)',
                    borderColor: isDarkMode ? 'rgba(56, 189, 248, 0.25)' : 'rgba(2, 132, 199, 0.18)',
                  },
                ]}
              >
                <Image
                  source={require('../../assets/icon.png')}
                  style={styles.brandLogoImage}
                  resizeMode="contain"
                />
              </View>

              <View style={styles.titleRow}>
                <Text style={[styles.brandTitle, { color: theme.textPrimary }]}>
                  Aqua<Text style={styles.brandTitleAccent}>Pin</Text>
                </Text>
              </View>
              <Text style={[styles.brandSubtitle, { color: theme.textSecondary }]}>
                {isSignUp ? 'Create your farm workspace' : 'Aquaculture Field Operations'}
              </Text>
            </View>

            {/* Apple-style Segmented Switcher */}
            <View
              style={[
                styles.segmentedContainer,
                {
                  backgroundColor: theme.segmentedBg,
                  borderColor: theme.segmentedBorder,
                },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.segmentedTab,
                  !isSignUp && [
                    styles.segmentedTabActive,
                    {
                      backgroundColor: theme.pillActiveBg,
                      borderColor: isDarkMode ? 'rgba(56, 189, 248, 0.35)' : 'rgba(2, 132, 199, 0.22)',
                    },
                  ],
                ]}
                onPress={() => handleModeSwitch(false)}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.segmentedText,
                    {
                      color: !isSignUp ? theme.pillActiveText : theme.pillInactiveText,
                      fontWeight: !isSignUp ? '800' : '600',
                    },
                  ]}
                >
                  Log In
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentedTab,
                  isSignUp && [
                    styles.segmentedTabActive,
                    {
                      backgroundColor: theme.pillActiveBg,
                      borderColor: isDarkMode ? 'rgba(56, 189, 248, 0.35)' : 'rgba(2, 132, 199, 0.22)',
                    },
                  ],
                ]}
                onPress={() => handleModeSwitch(true)}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.segmentedText,
                    {
                      color: isSignUp ? theme.pillActiveText : theme.pillInactiveText,
                      fontWeight: isSignUp ? '800' : '600',
                    },
                  ]}
                >
                  Register
                </Text>
              </TouchableOpacity>
            </View>

            {/* Cooldown / Rate Limit Notice */}
            {isCooldownActive && (
              <View
                style={[
                  styles.cooldownBanner,
                  {
                    backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.15)' : '#fffbeb',
                    borderColor: isDarkMode ? 'rgba(245, 158, 11, 0.35)' : '#fde68a',
                  },
                ]}
              >
                <Ionicons name="time-outline" size={17} color="#f59e0b" />
                <View style={styles.cooldownCopy}>
                  <Text style={styles.cooldownTitle}>Cooldown Active</Text>
                  <Text style={[styles.cooldownText, { color: theme.textSecondary }]}>
                    Too many attempts. You can try again in {remainingCooldownSeconds}s.
                  </Text>
                </View>
              </View>
            )}

            {/* FORM FIELDS */}
            {/* 1. Full Name (Register Mode Only) */}
            {isSignUp && (
              <View style={styles.inputGroup}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Full Name</Text>
                <Pressable
                  style={[
                    styles.glassInputBox,
                    {
                      backgroundColor:
                        focusedField === 'fullName' ? theme.inputFocusedBg : theme.inputBg,
                      borderColor: errors.fullName
                        ? '#ef4444'
                        : focusedField === 'fullName'
                        ? theme.inputFocusedBorder
                        : theme.inputBorder,
                    },
                  ]}
                  onPress={() => fullNameInputRef.current?.focus()}
                >
                  <View style={styles.iconSlot}>
                    <Ionicons
                      name="person-outline"
                      size={19}
                      color={
                        errors.fullName
                          ? '#ef4444'
                          : focusedField === 'fullName'
                          ? theme.inputFocusedBorder
                          : theme.textMuted
                      }
                    />
                  </View>
                  <TextInput
                    ref={fullNameInputRef}
                    style={[styles.textInput, { color: theme.textPrimary }]}
                    value={fullName}
                    onChangeText={(text) => {
                      setFullName(text);
                      if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
                    }}
                    placeholder="e.g. Juan Dela Cruz"
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="words"
                    autoComplete="name"
                    textContentType="name"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    editable={!loading}
                    onSubmitEditing={() => emailInputRef.current?.focus()}
                    onFocus={() => setFocusedField('fullName')}
                    onBlur={() => setFocusedField((prev) => (prev === 'fullName' ? null : prev))}
                    maxLength={80}
                  />
                  <View style={styles.trailingSlot}>
                    {fullNameIsValid && (
                      <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                    )}
                  </View>
                </Pressable>
                {errors.fullName ? (
                  <View style={styles.errorRow}>
                    <Ionicons name="alert-circle-outline" size={13} color="#ef4444" />
                    <Text style={styles.errorCaption}>{errors.fullName}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* 2. Email Address (Both Modes) */}
            <View style={styles.inputGroup}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Email Address</Text>
              <Pressable
                style={[
                  styles.glassInputBox,
                  {
                    backgroundColor:
                      focusedField === 'email' ? theme.inputFocusedBg : theme.inputBg,
                    borderColor: errors.email
                      ? '#ef4444'
                      : focusedField === 'email'
                      ? theme.inputFocusedBorder
                      : theme.inputBorder,
                  },
                ]}
                onPress={() => emailInputRef.current?.focus()}
              >
                <View style={styles.iconSlot}>
                  <Ionicons
                    name="mail-outline"
                    size={19}
                    color={
                      errors.email
                        ? '#ef4444'
                        : focusedField === 'email'
                        ? theme.inputFocusedBorder
                        : theme.textMuted
                    }
                  />
                </View>
                <TextInput
                  ref={emailInputRef}
                  style={[styles.textInput, { color: theme.textPrimary }]}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  placeholder="name@farm.com"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  editable={!loading}
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField((prev) => (prev === 'email' ? null : prev))}
                  autoCorrect={false}
                />
                <View style={styles.trailingSlot}>
                  {normalizedEmail.length > 0 && validateEmail(normalizedEmail) && (
                    <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                  )}
                </View>
              </Pressable>
              {errors.email ? (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle-outline" size={13} color="#ef4444" />
                  <Text style={styles.errorCaption}>{errors.email}</Text>
                </View>
              ) : null}
            </View>

            {/* 3. Password Field (Both Modes) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Password</Text>
                {!isSignUp && (
                  <TouchableOpacity
                    onPress={handleForgotPassword}
                    disabled={loading || resetLoading}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.forgotPasswordLink, { color: theme.pillActiveText }]}>
                      {resetLoading ? 'Sending link...' : 'Forgot Password?'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <Pressable
                style={[
                  styles.glassInputBox,
                  {
                    backgroundColor:
                      focusedField === 'password' ? theme.inputFocusedBg : theme.inputBg,
                    borderColor: errors.password
                      ? '#ef4444'
                      : focusedField === 'password'
                      ? theme.inputFocusedBorder
                      : theme.inputBorder,
                  },
                ]}
                onPress={() => passwordInputRef.current?.focus()}
              >
                <View style={styles.iconSlot}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={19}
                    color={
                      errors.password
                        ? '#ef4444'
                        : focusedField === 'password'
                        ? theme.inputFocusedBorder
                        : theme.textMuted
                    }
                  />
                </View>
                <TextInput
                  ref={passwordInputRef}
                  style={[styles.textInput, { color: theme.textPrimary }]}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  placeholder="••••••••"
                  placeholderTextColor={theme.textMuted}
                  secureTextEntry={!showPassword}
                  autoComplete={isSignUp ? 'new-password' : 'password'}
                  textContentType={isSignUp ? 'newPassword' : 'password'}
                  editable={!loading}
                  returnKeyType={isSignUp ? 'next' : 'done'}
                  blurOnSubmit={!isSignUp}
                  onSubmitEditing={() => {
                    if (isSignUp) {
                      confirmPasswordInputRef.current?.focus();
                    } else {
                      handleSubmit();
                    }
                  }}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField((prev) => (prev === 'password' ? null : prev))}
                />
                <View style={styles.trailingSlot}>
                  <TouchableOpacity
                    onPress={() => setShowPassword((prev) => !prev)}
                    style={styles.toggleVisibilityButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={theme.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              </Pressable>
              {errors.password ? (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle-outline" size={13} color="#ef4444" />
                  <Text style={styles.errorCaption}>{errors.password}</Text>
                </View>
              ) : null}

              {/* Password Strength Indicator */}
              {isSignUp && password.length > 0 && (
                <View style={styles.strengthContainer}>
                  <View
                    style={[
                      styles.strengthTrack,
                      { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                    ]}
                  >
                    <View
                      style={[
                        styles.strengthFill,
                        {
                          width: `${passwordStrength.strength * 100}%`,
                          backgroundColor: passwordStrength.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.strengthText, { color: passwordStrength.color }]}>
                    {passwordStrength.label}
                  </Text>
                </View>
              )}
            </View>

            {/* 4. Confirm Password Field (Register Mode Only) */}
            {isSignUp && (
              <View style={styles.inputGroup}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Confirm Password</Text>
                <Pressable
                  style={[
                    styles.glassInputBox,
                    {
                      backgroundColor:
                        focusedField === 'confirmPassword' ? theme.inputFocusedBg : theme.inputBg,
                      borderColor: errors.confirmPassword
                        ? '#ef4444'
                        : focusedField === 'confirmPassword'
                        ? theme.inputFocusedBorder
                        : theme.inputBorder,
                    },
                  ]}
                  onPress={() => confirmPasswordInputRef.current?.focus()}
                >
                  <View style={styles.iconSlot}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={19}
                      color={
                        errors.confirmPassword
                          ? '#ef4444'
                          : focusedField === 'confirmPassword'
                          ? theme.inputFocusedBorder
                          : theme.textMuted
                      }
                    />
                  </View>
                  <TextInput
                    ref={confirmPasswordInputRef}
                    style={[styles.textInput, { color: theme.textPrimary }]}
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      if (errors.confirmPassword) {
                        setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                      }
                    }}
                    placeholder="••••••••"
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry={!showConfirmPassword}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    editable={!loading}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                    onFocus={() => setFocusedField('confirmPassword')}
                    onBlur={() => setFocusedField((prev) => (prev === 'confirmPassword' ? null : prev))}
                  />
                  <View style={styles.trailingSlot}>
                    {confirmPasswordMatches ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color="#10b981"
                        style={{ marginRight: 4 }}
                      />
                    ) : null}
                    <TouchableOpacity
                      onPress={() => setShowConfirmPassword((prev) => !prev)}
                      style={styles.toggleVisibilityButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      <Ionicons
                        name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color={theme.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                </Pressable>
                {errors.confirmPassword ? (
                  <View style={styles.errorRow}>
                    <Ionicons name="alert-circle-outline" size={13} color="#ef4444" />
                    <Text style={styles.errorCaption}>{errors.confirmPassword}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* Primary Action Button */}
            <View style={styles.actionButtonContainer}>
              <TouchableOpacity
                style={[
                  styles.prominentButton,
                  {
                    backgroundColor: theme.buttonBg,
                    opacity: loading || isCooldownActive ? 0.75 : 1,
                  },
                ]}
                onPress={handleSubmit}
                disabled={loading || isCooldownActive}
                activeOpacity={0.82}
              >
                {loading ? (
                  <View style={styles.buttonInnerLoading}>
                    <ActivityIndicator color="#ffffff" size="small" />
                    <Text style={styles.buttonLabel}>
                      {isSignUp ? 'Creating account...' : 'Signing in...'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.buttonInner}>
                    <Text style={styles.buttonLabel}>
                      {isCooldownActive
                        ? `Wait (${remainingCooldownSeconds}s)`
                        : isSignUp
                        ? 'Create Account'
                        : 'Log In'}
                    </Text>
                    <Ionicons
                      name={isSignUp ? 'arrow-forward' : 'log-in-outline'}
                      size={18}
                      color="#ffffff"
                      style={styles.buttonIcon}
                    />
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Bottom Seamless Auth Switcher Link */}
            <View style={styles.switchAuthSection}>
              <Text style={[styles.switchAuthPrompt, { color: theme.textSecondary }]}>
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}
              </Text>
              <TouchableOpacity
                onPress={() => handleModeSwitch(!isSignUp)}
                disabled={loading}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Text style={[styles.switchAuthAction, { color: theme.pillActiveText }]}>
                  {isSignUp ? ' Login' : ' Register'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },

  /* Single Centered Apple-Inspired Liquid Glass Card */
  liquidGlassCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 30,
    borderWidth: 1.5,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 22,
    position: 'relative',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 30,
    elevation: 8,
  },
  glassSpecularReflection: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 1.5,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    opacity: 0.9,
  },

  /* Brand Header */
  brandHeader: {
    alignItems: 'center',
    marginBottom: 18,
  },
  brandLogoCircle: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  brandLogoImage: {
    width: 34,
    height: 34,
    borderRadius: 7,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  brandTitleAccent: {
    color: '#0284c7',
  },
  brandSubtitle: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },

  /* Apple Segmented Control */
  segmentedContainer: {
    flexDirection: 'row',
    borderRadius: 15,
    padding: 3,
    borderWidth: 1,
    marginBottom: 18,
  },
  segmentedTab: {
    flex: 1,
    paddingVertical: 8.5,
    alignItems: 'center',
    borderRadius: 12,
  },
  segmentedTabActive: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  segmentedText: {
    fontSize: 13,
    letterSpacing: 0.2,
  },

  /* Cooldown Notice */
  cooldownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  cooldownCopy: {
    flex: 1,
  },
  cooldownTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#d97706',
  },
  cooldownText: {
    fontSize: 11.5,
    marginTop: 1,
  },

  /* Input Fields */
  inputGroup: {
    marginBottom: 13,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
    paddingHorizontal: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 5,
    paddingHorizontal: 2,
    letterSpacing: 0.1,
  },
  forgotPasswordLink: {
    fontSize: 12,
    fontWeight: '600',
  },
  glassInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 15,
    borderWidth: 1.2,
    paddingHorizontal: 12,
  },
  iconSlot: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  trailingSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 28,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 0,
  },
  toggleVisibilityButton: {
    padding: 4,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    paddingHorizontal: 3,
  },
  errorCaption: {
    fontSize: 11.5,
    color: '#ef4444',
    fontWeight: '500',
  },

  /* Password Strength Indicator */
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 3,
  },
  strengthTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: 8,
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthText: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 44,
    textAlign: 'right',
  },

  /* Action Button */
  actionButtonContainer: {
    marginTop: 6,
    marginBottom: 6,
  },
  prominentButton: {
    height: 50,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 3,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInnerLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  buttonIcon: {
    marginLeft: 8,
  },

  /* Switch Auth Link */
  switchAuthSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 180, 210, 0.25)',
  },
  switchAuthPrompt: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  switchAuthAction: {
    fontSize: 12.5,
    fontWeight: '700',
  },
});
