import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
// Use legacy API to keep copyAsync and deleteAsync without refactor
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Alert, Animated, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

type Gesture = 'short' | 'long' | 'double';

type Trigger = {
  buttonId: string;
  gesture: Gesture;
};

type SoundItem = {
  id: string;
  name: string;
  uri: string;
};

type Mapping = Record<string, string | undefined>;

const colors = {
  background: '#0f1116',
  surface: '#161a20',
  surfaceAlt: '#1c212b',
  border: '#252b38',
  text: '#f6f7fb',
  muted: '#a6adbd',
  accent: '#f6c445',
  danger: '#ff7a7a',
};

const BUTTONS = [
  { id: 'b1', label: 'Button 1' },
  { id: 'b2', label: 'Button 2' },
  { id: 'b3', label: 'Button 3' },
];

const GESTURES: { key: Gesture; label: string }[] = [
  { key: 'short', label: 'Short press' },
  { key: 'long', label: 'Long press' },
  { key: 'double', label: 'Double tap' },
];

const TRIGGERS: Trigger[] = BUTTONS.flatMap((button) =>
  GESTURES.map((gesture) => ({ buttonId: button.id, gesture: gesture.key })),
);

const STORAGE_KEYS = {
  sounds: '@audio-feed/sounds',
  mappings: '@audio-feed/mappings',
};

const Tab = createBottomTabNavigator();

const triggerKey = (trigger: Trigger) => `${trigger.buttonId}-${trigger.gesture}`;

const triggerLabel = (trigger: Trigger) => {
  const buttonLabel = BUTTONS.find((b) => b.id === trigger.buttonId)?.label ?? trigger.buttonId;
  const gestureLabel = GESTURES.find((g) => g.key === trigger.gesture)?.label ?? trigger.gesture;
  return `${buttonLabel} · ${gestureLabel}`;
};

const randomId = () => Math.random().toString(36).slice(2, 10);

async function loadSounds(): Promise<SoundItem[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.sounds);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SoundItem[];
  } catch {
    return [];
  }
}

async function saveSounds(sounds: SoundItem[]) {
  await AsyncStorage.setItem(STORAGE_KEYS.sounds, JSON.stringify(sounds));
}

async function loadMappings(): Promise<Mapping> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.mappings);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Mapping;
  } catch {
    return {};
  }
}

async function saveMappings(mappings: Mapping) {
  await AsyncStorage.setItem(STORAGE_KEYS.mappings, JSON.stringify(mappings));
}

function useAudioPlayer() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<'playing' | 'paused' | null>(null);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      playsInSilentModeIOS: true,
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
      shouldDuckAndroid: true,
    });

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const stop = useCallback(async () => {
    if (!soundRef.current) return;
    try {
      await soundRef.current.stopAsync();
    } catch {
      // ignore
    }
    await soundRef.current.unloadAsync();
    soundRef.current = null;
    setCurrentId(null);
    setPlaybackState(null);
  }, []);

  const play = useCallback(
    async (sound: SoundItem) => {
      await stop();
      const { sound: loadedSound } = await Audio.Sound.createAsync(
        { uri: sound.uri },
        { shouldPlay: true },
      );
      soundRef.current = loadedSound;
      setCurrentId(sound.id);
      setPlaybackState('playing');
      loadedSound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        setPlaybackState(status.isPlaying ? 'playing' : 'paused');
        if (status.didJustFinish) {
          setCurrentId(null);
          setPlaybackState(null);
        }
      });
    },
    [stop],
  );

  const pause = useCallback(async () => {
    if (!soundRef.current) return;
    try {
      await soundRef.current.pauseAsync();
      setPlaybackState('paused');
    } catch {
      // ignore
    }
  }, []);

  const resume = useCallback(async () => {
    if (!soundRef.current) return;
    try {
      await soundRef.current.playAsync();
      setPlaybackState('playing');
    } catch {
      // ignore
    }
  }, []);

  return { play, stop, pause, resume, currentId, playbackState };
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={styles.primaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

function OutlineButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.outlineButton,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={styles.outlineButtonLabel}>{label}</Text>
    </Pressable>
  );
}

function Pill({
  label,
  active,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <View style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{label}</Text>
    </View>
  );
}

function LibraryScreen({
  sounds,
  currentId,
  onImport,
  onRename,
  onDelete,
  onPlay,
  onPause,
  onResume,
  statusMessage,
  playbackState,
}: {
  sounds: SoundItem[];
  currentId: string | null;
  onImport: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onPlay: (sound: SoundItem) => void;
  onPause: () => void;
  onResume: () => void;
  statusMessage: string | null;
  playbackState: 'playing' | 'paused' | null;
}) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <SectionHeader
        title="Audio Library"
        action={
          <View style={styles.actionsRow}>
            <PrimaryButton label="Import audio" onPress={onImport} />
          </View>
        }
      />
      {sounds.length === 0 ? (
        <Text style={styles.muted}>No audio yet. Import any mp3/wav/m4a.</Text>
      ) : (
        <View style={styles.card}>
          {sounds.map((sound) => (
            <View key={sound.id} style={styles.soundRow}>
              <View style={styles.soundRowMain}>
                <TextInput
                  value={sound.name}
                  onChangeText={(text) => onRename(sound.id, text)}
                  style={styles.soundName}
                  placeholder="Name"
                  placeholderTextColor={colors.muted}
                />
                <Pill
                  label={
                    currentId === sound.id
                      ? playbackState === 'paused'
                        ? 'Paused'
                        : 'Playing'
                      : 'Ready'
                  }
                  active={currentId === sound.id}
                />
              </View>
              <View style={styles.soundActions}>
                <PrimaryButton label="Play" onPress={() => onPlay(sound)} />
                <OutlineButton
                  label={
                    currentId === sound.id && playbackState === 'paused'
                      ? 'Resume'
                      : 'Pause'
                  }
                  onPress={() => {
                    if (currentId === sound.id && playbackState === 'paused') {
                      onResume();
                    } else {
                      onPause();
                    }
                  }}
                  disabled={!(currentId === sound.id && playbackState)}
                />
                <OutlineButton
                  label="Delete"
                  onPress={() => onDelete(sound.id)}
                />
              </View>
            </View>
          ))}
        </View>
      )}
      {statusMessage ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>{statusMessage}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function MappingScreen({
  sounds,
  mappings,
  onSetMapping,
}: {
  sounds: SoundItem[];
  mappings: Mapping;
  onSetMapping: (key: string, soundId?: string) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <SectionHeader title="Mappings" />
      {sounds.length === 0 ? (
        <Text style={styles.muted}>Import audio first, then map triggers here.</Text>
      ) : (
        <View style={styles.card}>
          {TRIGGERS.map((trigger) => {
            const key = triggerKey(trigger);
            const mappedSound = sounds.find((s) => s.id === mappings[key]);
            const isOpen = openKey === key;
            return (
              <View key={key} style={styles.mappingRow}>
                <View style={styles.mappingHeader}>
                  <Text style={styles.mappingLabel}>{triggerLabel(trigger)}</Text>
                  <Pressable onPress={() => setOpenKey(isOpen ? null : key)}>
                    <Pill label={mappedSound ? mappedSound.name : 'Set sound'} active={!!mappedSound} />
                  </Pressable>
                </View>
                {isOpen && (
                  <View style={styles.mappingChoices}>
                    {sounds.map((sound) => (
                      <Pressable
                        key={sound.id}
                        onPress={() => {
                          onSetMapping(key, sound.id);
                          setOpenKey(null);
                        }}
                        style={({ pressed }) => [
                          styles.choiceRow,
                          mappings[key] === sound.id && styles.choiceRowActive,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.choiceLabel,
                            mappings[key] === sound.id && styles.choiceLabelActive,
                          ]}
                        >
                          {sound.name}
                        </Text>
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={() => {
                        onSetMapping(key, undefined);
                        setOpenKey(null);
                      }}
                      style={({ pressed }) => [styles.choiceRow, pressed && styles.buttonPressed]}
                    >
                      <Text style={styles.choiceLabel}>Clear mapping</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function TestScreen({
  mappings,
  onTrigger,
  lastTrigger,
  message,
  simulateBle,
  toggleSimulate,
}: {
  mappings: Mapping;
  onTrigger: (trigger: Trigger) => void;
  lastTrigger: string | null;
  message: string | null;
  simulateBle: boolean;
  toggleSimulate: (value: boolean) => void;
}) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <SectionHeader
        title="Test buttons"
        action={
          <PrimaryButton
            label="Connect to device"
            onPress={() => Alert.alert('Bluetooth', 'Real Bluetooth hookup comes in Phase 2.')}
          />
        }
      />
      <View style={styles.card}>
        <View style={styles.simRow}>
          <Text style={styles.text}>Simulate BLE events</Text>
          <Switch value={simulateBle} onValueChange={toggleSimulate} thumbColor={colors.accent} />
        </View>
        <Text style={styles.muted}>
          Tap any virtual button to fire the trigger. If a mapping exists, audio plays immediately.
        </Text>
        <View style={styles.buttonGrid}>
          {TRIGGERS.map((trigger) => {
            const key = triggerKey(trigger);
            const mapped = mappings[key];
            const active = lastTrigger === key;
            return (
              <Pressable
                key={key}
                onPress={() => onTrigger(trigger)}
                style={({ pressed }) => [
                  styles.triggerButton,
                  mapped ? styles.triggerButtonActive : undefined,
                  active && styles.triggerButtonRecent,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.triggerTitle}>{triggerLabel(trigger)}</Text>
                <Text style={styles.triggerMeta}>{mapped ? 'Mapped' : 'Unmapped'}</Text>
              </Pressable>
            );
          })}
        </View>
        {message && (
          <View style={styles.message}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function ActionsScreen({
  sounds,
  currentId,
  playbackState,
  onPlay,
  onPause,
  onResume,
}: {
  sounds: SoundItem[];
  currentId: string | null;
  playbackState: 'playing' | 'paused' | null;
  onPlay: (sound: SoundItem) => void;
  onPause: () => void;
  onResume: () => void;
}) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <SectionHeader title="Actions" />
      {sounds.length === 0 ? (
        <Text style={styles.muted}>Import audio in Library, then trigger from here.</Text>
      ) : (
        <View style={styles.actionGrid}>
          {sounds.map((sound) => {
            const isCurrent = currentId === sound.id;
            const isPaused = playbackState === 'paused' && isCurrent;
            return (
              <Pressable
                key={sound.id}
                onPress={() => onPlay(sound)}
                style={({ pressed }) => [
                  styles.actionTile,
                  isCurrent && styles.actionTileActive,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.actionTitle}>{sound.name}</Text>
                <View style={styles.actionRow}>
                  <Pill
                    label={isCurrent ? (isPaused ? 'Paused' : 'Playing') : 'Ready'}
                    active={isCurrent}
                  />
                  {isCurrent ? (
                    <OutlineButton
                      label={isPaused ? 'Resume' : 'Pause'}
                      onPress={isPaused ? onResume : onPause}
                    />
                  ) : (
                    <PrimaryButton label="Play" onPress={() => onPlay(sound)} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

export default function App() {
  const [sounds, setSounds] = useState<SoundItem[]>([]);
  const [mappings, setMappings] = useState<Mapping>({});
  const [lastTrigger, setLastTrigger] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [simulateBle, setSimulateBle] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const fireAnim = useRef(new Animated.Value(0));
  const audio = useAudioPlayer();

  useEffect(() => {
    (async () => {
      const [savedSounds, savedMappings] = await Promise.all([loadSounds(), loadMappings()]);
      setSounds(savedSounds);
      setMappings(savedMappings);
      setIsReady(true);
    })();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setIntroDone(true), 3000);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fireAnim.current, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(fireAnim.current, { toValue: 0, duration: 700, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    if (!isReady) return;
    saveSounds(sounds);
    saveMappings(mappings);
  }, [sounds, mappings, isReady]);

  const onTrigger = useCallback(
    async (trigger: Trigger, isAuto = false) => {
      const key = triggerKey(trigger);
      setLastTrigger(key);
      const soundId = mappings[key];
      if (!soundId) {
        setMessage('No sound mapped yet.');
        await audio.stop();
        return;
      }
      const sound = sounds.find((s) => s.id === soundId);
      if (!sound) {
        setMessage('Mapped sound is missing.');
        return;
      }
      setMessage(`${isAuto ? 'Simulated' : 'Playing'}: ${sound.name}`);
      try {
        await audio.play(sound);
      } catch (err) {
        setMessage('Could not play audio.');
        console.warn(err);
      }
    },
    [audio, mappings, sounds],
  );

  useEffect(() => {
    if (!simulateBle) return;
    const id = setInterval(() => {
      const trigger = TRIGGERS[Math.floor(Math.random() * TRIGGERS.length)];
      onTrigger(trigger, true);
    }, 5000);
    return () => clearInterval(id);
  }, [simulateBle, mappings, sounds, onTrigger]);

  const handleImport = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled) {
        setMessage('Import canceled.');
        return;
      }
      const file = result.assets?.[0];
      if (!file?.uri) {
        setMessage('No file selected (picker returned empty).');
        return;
      }

      const extension = file.name?.split('.').pop() ?? 'm4a';
      const destination = `${FileSystem.documentDirectory}audio-${Date.now()}.${extension}`;
      await FileSystem.copyAsync({ from: file.uri, to: destination });
      const info = await FileSystem.getInfoAsync(destination);
      if (!info.exists) {
        setMessage('Import failed: copied file not found.');
        return;
      }
      const newSound: SoundItem = {
        id: randomId(),
        name: file.name?.replace(/\.[^/.]+$/, '') || 'New sound',
        uri: destination,
      };
      setSounds((prev) => [...prev, newSound]);
      setMessage(`Imported: ${newSound.name}`);
    } catch (error) {
      console.warn('Import failed', error);
      setMessage(
        `Import failed. ${error instanceof Error ? error.message : 'Try again or use the sample tone.'}`,
      );
    }
  }, []);

  const handleRename = useCallback((id: string, name: string) => {
    setSounds((prev) => prev.map((sound) => (sound.id === id ? { ...sound, name } : sound)));
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      const sound = sounds.find((s) => s.id === id);
      Alert.alert('Delete sound', 'Remove this audio and related mappings?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSounds((prev) => prev.filter((s) => s.id !== id));
            setMappings((prev) => {
              const next = { ...prev };
              Object.keys(next).forEach((key) => {
                if (next[key] === id) delete next[key];
              });
              return next;
            });
            if (sound) {
              try {
                await FileSystem.deleteAsync(sound.uri, { idempotent: true });
              } catch {
                // ignore
              }
            }
          },
        },
      ]);
    },
    [sounds],
  );

  const handleSetMapping = useCallback((key: string, soundId?: string) => {
    setMappings((prev) => ({ ...prev, [key]: soundId }));
  }, []);

  const navigationTheme = useMemo(
    () => ({
      ...DarkTheme,
      colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface, text: colors.text },
    }),
    [],
  );

  if (!introDone) {
    const fireColor = fireAnim.current.interpolate({
      inputRange: [0, 1],
      outputRange: ['#ffcf32', '#ff7f00'],
    });
    const fireRadius = fireAnim.current.interpolate({
      inputRange: [0, 1],
      outputRange: [4, 10],
    });

    return (
      <View style={styles.introScreen}>
        <StatusBar style="light" />
        <View style={styles.introLogoPill}>
          <Animated.Text
            style={[
              styles.introFireText,
              {
                color: fireColor,
                textShadowRadius: fireRadius as unknown as number,
              },
            ]}
          >
            Aura Farmer
          </Animated.Text>
        </View>
        <View style={styles.introArt}>
          <View style={styles.introShape} />
          <View style={styles.introShapeAlt} />
          <Text style={styles.introIcon}>🎧</Text>
        </View>
        <Text style={styles.introTitle}>Welcome to the Aura Farming App</Text>
        <Text style={styles.introSubtitle}>Craft, map, and trigger your audio moments in seconds.</Text>
        <View style={styles.introProgressBar}>
          <View style={styles.introProgressFill} />
        </View>
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
        }}
      >
        <Tab.Screen name="Library">
          {() => (
            <LibraryScreen
              sounds={sounds}
              currentId={audio.currentId}
              playbackState={audio.playbackState}
              onImport={handleImport}
              onRename={handleRename}
              onDelete={handleDelete}
              onPlay={(sound) => {
                (async () => {
                  try {
                    setMessage(`Preview: ${sound.name}`);
                    await audio.play(sound);
                  } catch (err) {
                    setMessage('Could not play audio.');
                  }
                })();
              }}
              onPause={() => {
                (async () => {
                  await audio.pause();
                })();
              }}
              onResume={() => {
                (async () => {
                  await audio.resume();
                })();
              }}
              statusMessage={message}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Mapping">
          {() => (
            <MappingScreen
              sounds={sounds}
              mappings={mappings}
              onSetMapping={handleSetMapping}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Actions">
          {() => (
            <ActionsScreen
              sounds={sounds}
              currentId={audio.currentId}
              playbackState={audio.playbackState}
              onPlay={(sound) => {
                (async () => {
                  try {
                    setMessage(`Playing: ${sound.name}`);
                    await audio.play(sound);
                  } catch (err) {
                    setMessage('Could not play audio.');
                  }
                })();
              }}
              onPause={() => {
                (async () => {
                  await audio.pause();
                })();
              }}
              onResume={() => {
                (async () => {
                  await audio.resume();
                })();
              }}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Test">
          {() => (
            <TestScreen
              mappings={mappings}
              onTrigger={onTrigger}
              lastTrigger={lastTrigger}
              message={message}
              simulateBle={simulateBle}
              toggleSimulate={setSimulateBle}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  introScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  introLogoPill: {
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#ff9b00',
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  introFireText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.6,
    textShadowColor: '#ff5e00',
  },
  introArt: {
    width: '100%',
    height: 240,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introShape: {
    position: 'absolute',
    width: '78%',
    height: '68%',
    borderRadius: 30,
    backgroundColor: colors.surface,
    opacity: 0.6,
    transform: [{ rotate: '-6deg' }],
  },
  introShapeAlt: {
    position: 'absolute',
    width: '70%',
    height: '60%',
    borderRadius: 26,
    backgroundColor: colors.surfaceAlt,
    opacity: 0.7,
    transform: [{ rotate: '8deg' }],
  },
  introIcon: {
    fontSize: 72,
    zIndex: 2,
  },
  introTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  introSubtitle: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
  },
  introProgress: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  introProgressBar: {
    width: 90,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  introProgressFill: {
    flex: 1,
    backgroundColor: colors.accent,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  text: {
    color: colors.text,
  },
  muted: {
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  soundRow: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  soundRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  soundName: {
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    flex: 1,
  },
  soundActions: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  primaryButtonLabel: {
    color: '#0d0d0d',
    fontWeight: '700',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  outlineButtonLabel: {
    color: colors.text,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pillLabel: {
    color: colors.muted,
    fontWeight: '600',
  },
  pillLabelActive: {
    color: '#0d0d0d',
  },
  mappingRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 8,
    gap: 8,
  },
  mappingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  mappingLabel: {
    color: colors.text,
    fontWeight: '600',
  },
  mappingChoices: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  choiceRow: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  choiceRowActive: {
    backgroundColor: '#252c38',
  },
  choiceLabel: {
    color: colors.text,
  },
  choiceLabelActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  simRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  triggerButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    width: '48%',
  },
  triggerButtonActive: {
    borderColor: colors.accent,
  },
  triggerButtonRecent: {
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  triggerTitle: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: 6,
  },
  triggerMeta: {
    color: colors.muted,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionTile: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  actionTileActive: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  actionTitle: {
    color: colors.text,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  message: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderColor: colors.border,
    borderWidth: 1,
  },
  messageText: {
    color: colors.text,
  },
});
