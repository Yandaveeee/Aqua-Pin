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
  Animated,
  Easing,
  Keyboard,
  ScrollView,
  Image,
  ImageBackground,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { aquapinColors } from '../theme/aquapin';

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
}

type FocusField = 'fullName' | 'email' | 'password' | null;

export default function LoginScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [focusedField, setFocusedField] = useState<FocusField>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const { signIn, signUp } = useAuth();

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const iconRotate = useRef(new Animated.Value(0)).current;
  const fullNameInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
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

  const animateModeSwitch = useCallback(
    (toSignUp: boolean) => {
      Keyboard.dismiss();
      setFocusedField(null);

      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
        easing: Easing.ease,
      }).start(() => {
        setIsSignUp(toSignUp);
        setErrors({});
        setFullName('');
        setPassword('');
        setShowPassword(false);

        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.ease,
        }).start();
      });

      Animated.timing(iconRotate, {
        toValue: toSignUp ? 1 : 0,
        duration: 350,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease),
      }).start();
    },
    [fadeAnim, iconRotate]
  );

  const animateButtonPress = useCallback(
    (pressed: boolean) => {
      Animated.spring(buttonScale, {
        toValue: pressed ? 0.97 : 1,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }).start();
    },
    [buttonScale]
  );

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    const normalizedFullName = fullName.trim().replace(/\s+/g, ' ');
    const normalizedEmail = email.trim().toLowerCase();

    if (isSignUp) {
      if (!normalizedFullName) {
        newErrors.fullName = 'Full name is required';
      } else if (normalizedFullName.length < 3 || normalizedFullName.length > 80) {
        newErrors.fullName = 'Enter a full name between 3 and 80 characters';
      } else if (normalizedFullName.split(' ').length < 2) {
        newErrors.fullName = 'Enter your first and last name';
      }
    }

    if (!normalizedEmail) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(normalizedEmail)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (isSignUp) {
      const passwordError = validatePassword(password);
      if (passwordError) newErrors.password = passwordError;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (loading || submitInFlightRef.current) {
      return;
    }

    Keyboard.dismiss();
    setFocusedField(null);

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
            'Your account was created. Open the verification email on this device; the link should return to Aquapin. If it still opens localhost, add aquapin://auth/callback to Supabase Auth Redirect URLs.',
            [
            {
              text: 'OK',
              onPress: () => animateModeSwitch(false),
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

  const getPasswordStrength = (): { strength: number; color: string; label: string } => {
    if (password.length === 0) return { strength: 0, color: aquapinColors.textMuted, label: '' };

    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2) return { strength: 0.33, color: aquapinColors.red, label: 'Weak' };
    if (score <= 4) return { strength: 0.66, color: aquapinColors.amber, label: 'Medium' };
    return { strength: 1, color: aquapinColors.green, label: 'Strong' };
  };

  const passwordStrength = getPasswordStrength();
  const normalizedFullName = fullName.trim().replace(/\s+/g, ' ');
  const fullNameIsValid =
    normalizedFullName.length >= 3 &&
    normalizedFullName.length <= 80 &&
    normalizedFullName.split(' ').length >= 2;
  const normalizedEmail = email.trim();
  const signUpPasswordError = isSignUp ? validatePassword(password) : null;
  const remainingCooldownSeconds = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - currentTime) / 1000)) : 0;
  const isCooldownActive = remainingCooldownSeconds > 0;
  const canSubmit =
    !loading &&
    !isCooldownActive &&
    validateEmail(normalizedEmail) &&
    password.length > 0 &&
    (!isSignUp || (fullNameIsValid && !signUpPasswordError));

  const iconRotation = iconRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundLayer} pointerEvents="none">
        <ImageBackground
          source={require('../../assets/aquaculture-login-bg.png')}
          style={styles.backgroundImageLayer}
          imageStyle={styles.backgroundImage}
          resizeMode="cover"
        >
          <View style={styles.backgroundOverlay} />
        </ImageBackground>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <Animated.View style={[styles.iconCircle, { transform: [{ rotate: iconRotation }] }]}>
                <Image
                  source={require('../../assets/icon.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </Animated.View>
              <View>
                <Text style={styles.title}>
                  Aqua<Text style={styles.titleAccent}>pin</Text>
                </Text>
                <Text style={styles.subtitle}>Aquapin Version 2.0</Text>
              </View>
            </View>
            <Text style={styles.headerBlurb}>
              Manage ponds, farm records, offline sync, and AI insights in one modern aquaculture workspace.
            </Text>
            <View style={styles.headerMetaRow}>
              <View style={styles.headerMetaPill}>
                <Ionicons name="map-outline" size={14} color={aquapinColors.blue} />
                <Text style={styles.headerMetaText}>GPS mapping</Text>
              </View>
              <View style={styles.headerMetaPill}>
                <Ionicons name="cloud-done-outline" size={14} color={aquapinColors.green} />
                <Text style={styles.headerMetaText}>Offline sync</Text>
              </View>
              <View style={styles.headerMetaPill}>
                <Ionicons name="sparkles-outline" size={14} color={aquapinColors.teal} />
                <Text style={styles.headerMetaText}>AI insights</Text>
              </View>
            </View>
          </View>

          <Animated.View style={[styles.formCard, { opacity: fadeAnim }]}>
            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[styles.toggleButton, !isSignUp && styles.toggleButtonActive]}
                onPress={() => {
                  if (isSignUp) {
                    animateModeSwitch(false);
                  }
                }}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={[styles.toggleText, !isSignUp && styles.toggleTextActive]}>Log In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, isSignUp && styles.toggleButtonActive]}
                onPress={() => {
                  if (!isSignUp) {
                    animateModeSwitch(true);
                  }
                }}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={[styles.toggleText, isSignUp && styles.toggleTextActive]}>Register</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.formTitle}>{isSignUp ? 'Create Account' : 'Welcome Back'}</Text>
            <Text style={styles.formSubtitle}>
              {isSignUp
                ? 'Create your Aquapin farm workspace and start tracking ponds immediately.'
                : 'Sign in to continue to your Aquapin dashboard.'}
            </Text>
            {isCooldownActive && (
              <View style={styles.noticeCard}>
                <Ionicons name="time-outline" size={18} color={aquapinColors.amber} />
                <View style={styles.noticeCopy}>
                  <Text style={styles.noticeTitle}>Please wait before trying again</Text>
                  <Text style={styles.noticeText}>
                    Too many auth attempts were sent. Try again in {remainingCooldownSeconds}s.
                  </Text>
                </View>
              </View>
            )}

            {isSignUp && (
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Full Name</Text>
                <Pressable
                  style={[
                    styles.inputWrapper,
                    focusedField === 'fullName' && styles.inputWrapperFocused,
                    errors.fullName && styles.inputWrapperError,
                  ]}
                  onPress={() => fullNameInputRef.current?.focus()}
                >
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={errors.fullName ? aquapinColors.red : focusedField === 'fullName' ? aquapinColors.blue : aquapinColors.textMuted}
                    style={styles.leftIcon}
                  />
                  <TextInput
                    ref={fullNameInputRef}
                    style={styles.input}
                    value={fullName}
                    onChangeText={(text) => {
                      setFullName(text);
                      if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
                    }}
                    placeholder="Juan Dela Cruz"
                    autoCapitalize="words"
                    autoComplete="name"
                    textContentType="name"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    editable={!loading}
                    onSubmitEditing={() => emailInputRef.current?.focus()}
                    onFocus={() => setFocusedField('fullName')}
                    onBlur={() => setFocusedField((prev) => (prev === 'fullName' ? null : prev))}
                    placeholderTextColor={aquapinColors.textMuted}
                    autoCorrect={false}
                    maxLength={80}
                  />
                  {fullNameIsValid && (
                    <Ionicons name="checkmark-circle" size={20} color={aquapinColors.green} style={styles.trailingIcon} />
                  )}
                </Pressable>
                {errors.fullName && (
                  <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={14} color={aquapinColors.red} />
                    <Text style={styles.errorText}>{errors.fullName}</Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email Address</Text>
              <Pressable
                style={[
                  styles.inputWrapper,
                  focusedField === 'email' && styles.inputWrapperFocused,
                  errors.email && styles.inputWrapperError,
                ]}
                onPress={() => emailInputRef.current?.focus()}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={errors.email ? aquapinColors.red : focusedField === 'email' ? aquapinColors.blue : aquapinColors.textMuted}
                  style={styles.leftIcon}
                />
                <TextInput
                  ref={emailInputRef}
                  style={styles.input}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  placeholder="you@example.com"
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
                  placeholderTextColor={aquapinColors.textMuted}
                  autoCorrect={false}
                  spellCheck={false}
                  showSoftInputOnFocus
                />
                {normalizedEmail.length > 0 && validateEmail(normalizedEmail) && (
                  <Ionicons name="checkmark-circle" size={20} color={aquapinColors.green} style={styles.trailingIcon} />
                )}
              </Pressable>
              {errors.email && (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={14} color={aquapinColors.red} />
                  <Text style={styles.errorText}>{errors.email}</Text>
                </View>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <Pressable
                style={[
                  styles.inputWrapper,
                  focusedField === 'password' && styles.inputWrapperFocused,
                  errors.password && styles.inputWrapperError,
                ]}
                onPress={() => passwordInputRef.current?.focus()}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={errors.password ? aquapinColors.red : focusedField === 'password' ? aquapinColors.blue : aquapinColors.textMuted}
                  style={styles.leftIcon}
                />
                <TextInput
                  ref={passwordInputRef}
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  placeholder="••••••••"
                  secureTextEntry={!showPassword}
                  autoComplete={isSignUp ? 'new-password' : 'password'}
                  textContentType={isSignUp ? 'newPassword' : 'password'}
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField((prev) => (prev === 'password' ? null : prev))}
                  placeholderTextColor={aquapinColors.textMuted}
                  autoCorrect={false}
                  spellCheck={false}
                  showSoftInputOnFocus
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((prev) => !prev)}
                  style={styles.eyeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={aquapinColors.textMuted} />
                </TouchableOpacity>
              </Pressable>
              {errors.password && (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={14} color={aquapinColors.red} />
                  <Text style={styles.errorText}>{errors.password}</Text>
                </View>
              )}

              {isSignUp && password.length > 0 && (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthBarContainer}>
                    <View
                      style={[
                        styles.strengthBar,
                        {
                          width: `${passwordStrength.strength * 100}%`,
                          backgroundColor: passwordStrength.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>
                    {passwordStrength.label}
                  </Text>
                </View>
              )}

              {isSignUp && (
                <View style={styles.requirementsContainer}>
                  <RequirementItem met={password.length >= 8} text="At least 8 characters" />
                  <RequirementItem met={/[A-Z]/.test(password)} text="One uppercase letter" />
                  <RequirementItem met={/[0-9]/.test(password)} text="One number" />
                </View>
              )}
            </View>

            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  !canSubmit && styles.actionButtonInactive,
                  (loading || isCooldownActive) && styles.actionButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={loading || isCooldownActive}
                activeOpacity={0.85}
                onPressIn={() => animateButtonPress(true)}
                onPressOut={() => animateButtonPress(false)}
              >
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color={aquapinColors.surface} size="small" />
                    <Text style={styles.loadingText}>{isSignUp ? 'Creating account...' : 'Signing in...'}</Text>
                  </View>
                ) : (
                  <View style={styles.buttonContent}>
                    <Text style={styles.actionButtonText}>
                      {isCooldownActive
                        ? `Try Again in ${remainingCooldownSeconds}s`
                        : isSignUp
                          ? 'Create Account'
                          : 'Sign In'}
                    </Text>
                    <Ionicons
                      name={isCooldownActive ? 'time-outline' : isSignUp ? 'arrow-forward' : 'log-in-outline'}
                      size={20}
                      color={aquapinColors.surface}
                      style={styles.buttonIcon}
                    />
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>

            <View style={styles.helpContainer}>
              <Text style={styles.helpText}>
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (!loading) {
                    animateModeSwitch(!isSignUp);
                  }
                }}
                disabled={loading}
              >
                <Text style={styles.helpLink}>{isSignUp ? 'Sign in' : 'Register'}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          <View style={styles.footer}>
            <View style={styles.footerBadge}>
              <Ionicons name="shield-checkmark" size={14} color={aquapinColors.green} />
              <Text style={styles.footerBrand}>Aquapin Secure</Text>
            </View>
            <Text style={styles.footerText}>Offline-ready • Encrypted sync • Farm-first workflow</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RequirementItem({ met, text }: { met: boolean; text: string }) {
  return (
    <View style={styles.requirementItem}>
      <Ionicons name={met ? 'checkmark-circle' : 'ellipse-outline'} size={13} color={met ? aquapinColors.green : aquapinColors.textMuted} />
      <Text style={[styles.requirementText, met && styles.requirementMet]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: aquapinColors.background,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundImageLayer: {
    flex: 1,
  },
  backgroundImage: {
    opacity: 0.98,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(235, 248, 249, 0.56)',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  header: {
    marginBottom: 18,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.84)',
    borderWidth: 1,
    borderColor: 'rgba(216, 229, 241, 0.9)',
    padding: 18,
    shadowColor: '#18355d',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: aquapinColors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    shadowColor: '#7da4c5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 4,
  },
  logoImage: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: aquapinColors.blue,
    letterSpacing: 0.4,
  },
  titleAccent: {
    color: aquapinColors.green,
  },
  subtitle: {
    fontSize: 12,
    color: aquapinColors.textMuted,
    marginTop: 2,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '800',
  },
  headerBlurb: {
    marginTop: 14,
    color: aquapinColors.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  headerMetaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  headerMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: aquapinColors.surface,
    borderWidth: 1,
    borderColor: aquapinColors.border,
  },
  headerMetaText: {
    fontSize: 12,
    fontWeight: '700',
    color: aquapinColors.text,
  },
  formCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    shadowColor: '#18355d',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 18,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: aquapinColors.border,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 15,
  },
  toggleButtonActive: {
    backgroundColor: aquapinColors.blue,
    shadowColor: aquapinColors.blue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 3,
  },
  toggleText: {
    color: aquapinColors.textMuted,
    fontSize: 14,
    fontWeight: '800',
  },
  toggleTextActive: {
    color: aquapinColors.surface,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: aquapinColors.text,
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 14,
    color: aquapinColors.textMuted,
    marginBottom: 18,
    lineHeight: 20,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    marginBottom: 16,
    borderRadius: 18,
    backgroundColor: aquapinColors.amberSoft,
    borderWidth: 1,
    borderColor: '#f3dc9c',
  },
  noticeCopy: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: aquapinColors.amber,
    marginBottom: 2,
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 18,
    color: aquapinColors.textMuted,
  },
  inputContainer: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: aquapinColors.text,
    marginBottom: 6,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: aquapinColors.surfaceMuted,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputWrapperFocused: {
    borderColor: aquapinColors.blue,
    shadowColor: aquapinColors.blue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 2,
  },
  inputWrapperError: {
    borderColor: aquapinColors.red,
  },
  leftIcon: {
    marginRight: 10,
  },
  trailingIcon: {
    marginLeft: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: aquapinColors.text,
    paddingVertical: 12,
  },
  passwordInput: {
    paddingRight: 6,
  },
  eyeButton: {
    padding: 4,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginLeft: 4,
  },
  errorText: {
    fontSize: 12,
    color: aquapinColors.red,
    marginLeft: 6,
    fontWeight: '700',
  },
  strengthContainer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  strengthBarContainer: {
    flex: 1,
    height: 4,
    backgroundColor: aquapinColors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginRight: 10,
  },
  strengthBar: {
    height: '100%',
    borderRadius: 3,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 52,
    textAlign: 'right',
  },
  requirementsContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: aquapinColors.border,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  requirementText: {
    fontSize: 12,
    color: aquapinColors.textMuted,
    marginLeft: 8,
  },
  requirementMet: {
    color: aquapinColors.green,
    fontWeight: '700',
  },
  actionButton: {
    backgroundColor: aquapinColors.green,
    borderRadius: 18,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: aquapinColors.green,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 4,
  },
  actionButtonDisabled: {
    backgroundColor: aquapinColors.textMuted,
    opacity: 0.76,
  },
  actionButtonInactive: {
    backgroundColor: '#b9cadb',
    opacity: 0.76,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButtonText: {
    color: aquapinColors.surface,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  buttonIcon: {
    marginLeft: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    color: aquapinColors.surface,
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 10,
  },
  helpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: aquapinColors.border,
  },
  helpText: {
    color: aquapinColors.textMuted,
    fontSize: 14,
  },
  helpLink: {
    color: aquapinColors.blue,
    fontSize: 14,
    fontWeight: '800',
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(216, 229, 241, 0.9)',
  },
  footerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: aquapinColors.blueSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: aquapinColors.border,
  },
  footerBrand: {
    color: aquapinColors.blue,
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 6,
  },
  footerText: {
    fontSize: 12,
    color: aquapinColors.textMuted,
    textAlign: 'center',
  },
});
