import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLanguage } from "../components/LanguageContext";
import { useTheme } from "../components/ThemeContext";
import { useProjectContext } from "../components/ProjectContext";
import { getRuntimeFacade } from "../lib/runtime-facade";
import { subscribeTerminalOutput, type TerminalBusEvent } from "../core/terminal/TerminalOutputBus";
import { TerminalQuickActions } from "../core/enhancements/terminal/TerminalQuickActions";
import type { TerminalQuickActionId, TerminalSessionSnapshot, TerminalThemeDefinition, TerminalFontPreferences } from "../core/enhancements/terminal/types";
import { applyTerminalCommandInputAction, createTerminalCommandInputState, insertTerminalCommandText } from "../core/enhancements/terminal/TerminalCommandInputActions";
import { parseAnsiText } from "../core/enhancements/terminal/AnsiParser";
import { TerminalPreferencesPanel } from "../components/RuntimeEnhancementPanels";

const QUICK_ACTIONS_KEY = "aib.terminal.quick-actions.v1";
const label = (language: "ru" | "uk" | "en", ru: string, uk: string, en: string) => language === "ru" ? ru : language === "uk" ? uk : en;

export default function TerminalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language } = useLanguage();
  const { colors } = useTheme();
  const { project } = useProjectContext();
  const projectId = project?.id || project?.name || "demo";
  const [session, setSession] = useState<TerminalSessionSnapshot | null>(null);
  const [sessions, setSessions] = useState<readonly TerminalSessionSnapshot[]>([]);
  const [output, setOutput] = useState("");
  const [command, setCommand] = useState("");
  const [commandSelection, setCommandSelection] = useState({ start: 0, end: 0 });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [theme, setTheme] = useState<TerminalThemeDefinition | null>(null);
  const [font, setFont] = useState<TerminalFontPreferences>({ family: "monospace", size: 14, lineHeight: 1.35, letterSpacing: 0 });
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [customizing, setCustomizing] = useState(false);
  const [actionsReady, setActionsReady] = useState(false);
  const [visibleActions, setVisibleActions] = useState<readonly TerminalQuickActionId[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const outputRef = useRef("");
  const inputStateRef = useRef(createTerminalCommandInputState());
  const commandHistoryRef = useRef<string[]>([]);
  const commandInputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollMetricsRef = useRef({ offset: 0, viewportHeight: 0 });

  const refreshSessionRows = useCallback(async () => {
    const rows = await getRuntimeFacade().terminalUx.list();
    setSessions(rows.filter((item) => item.projectId === projectId));
    const active = rows.find((item) => item.id === sessionIdRef.current);
    if (active) setSession(active);
  }, [projectId]);
  const activateSession = useCallback((selected: TerminalSessionSnapshot) => {
    sessionIdRef.current = selected.id;
    setSession(selected);
    outputRef.current = selected.scrollback;
    setOutput(selected.scrollback);
    setNotice("");
  }, []);
  const refreshPreferences = useCallback(async () => {
    const facade = getRuntimeFacade();
    const [activeTheme, preferences] = await Promise.all([facade.terminalTheme.getActiveTheme(), facade.terminalFont.getPreferences()]);
    setTheme(activeTheme); setFont(preferences);
  }, []);
  const selectOrCreateSession = useCallback(async () => {
    const facade = getRuntimeFacade();
    const rows = await facade.terminalUx.list();
    let selected = rows.find((item) => item.projectId === projectId && item.state === "attached" && Boolean(facade.terminals?.has(item.id)));
    if (!selected) {
      const saved = rows.find((item) => item.projectId === projectId && item.state !== "attached");
      if (saved) selected = await facade.terminalUx.restoreSession(saved.id);
    }
    if (!selected || selected.state !== "attached") selected = await facade.terminalUx.openProjectSession(projectId);
    activateSession(selected);
    await refreshSessionRows();
  }, [activateSession, projectId, refreshSessionRows]);
  const createNewSession = useCallback(async () => {
    setBusy(true);
    try {
      const selected = await getRuntimeFacade().terminalUx.openProjectSession(projectId);
      activateSession(selected);
      await refreshSessionRows();
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }, [activateSession, projectId, refreshSessionRows]);
  const selectSession = useCallback(async (row: TerminalSessionSnapshot) => {
    if (busy) return;
    setBusy(true);
    try {
      const selected = row.state === "attached" && getRuntimeFacade().terminals?.has(row.id) ? row : await getRuntimeFacade().terminalUx.restoreSession(row.id);
      if (!selected || selected.state !== "attached") { setNotice(label(language, "Сессия сейчас недоступна.", "Сесія зараз недоступна.", "This session is currently unavailable.")); return; }
      activateSession(selected);
      await refreshSessionRows();
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }, [activateSession, busy, language, refreshSessionRows]);
  const closeCurrentSession = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id || busy) return;
    setBusy(true);
    try {
      await getRuntimeFacade().terminalUx.close(id);
      sessionIdRef.current = null; setSession(null); outputRef.current = ""; setOutput("");
      await refreshSessionRows();
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }, [busy, refreshSessionRows]);

  const commitCommandInput = useCallback((next: ReturnType<typeof createTerminalCommandInputState>) => {
    inputStateRef.current = next;
    setCommand(next.value);
    setCommandSelection(next.selection);
  }, []);
  const changeCommandInput = useCallback((value: string) => {
    const previous = inputStateRef.current.value;
    let prefix = 0;
    while (prefix < previous.length && prefix < value.length && previous[prefix] === value[prefix]) prefix += 1;
    let suffix = 0;
    while (suffix < previous.length - prefix && suffix < value.length - prefix && previous[previous.length - 1 - suffix] === value[value.length - 1 - suffix]) suffix += 1;
    const cursor = Math.min(value.length, prefix + value.length - prefix - suffix);
    commitCommandInput({ value, selection: { start: cursor, end: cursor }, historyIndex: -1, draftBeforeHistory: value });
  }, [commitCommandInput]);

  const dispatchQuickAction = useCallback(async (action: TerminalQuickActionId) => {
    if (action === "clear") { outputRef.current = ""; setOutput(""); const id = sessionIdRef.current; if (id) await getRuntimeFacade().terminalUx.clearScrollback(id); return { ok: true, supported: true }; }
    if (action === "copy-all") { await Clipboard.setStringAsync(outputRef.current); setNotice(label(language, "Вывод скопирован.", "Вивід скопійовано.", "Terminal output copied.")); return { ok: true, supported: true }; }
    if (action === "paste") {
      const clip = await Clipboard.getStringAsync();
      const current = inputStateRef.current;
      const selectedLength = current.selection.end - current.selection.start;
      const available = Math.max(0, 16_000 - current.value.length + selectedLength);
      const inserted = insertTerminalCommandText(current, clip.slice(0, available));
      commitCommandInput({ ...inserted, historyIndex: -1, draftBeforeHistory: inserted.value });
      commandInputRef.current?.focus();
      return { ok: true, supported: true };
    }
    if (action === "new-session") { await createNewSession(); return { ok: true, supported: true }; }
    const result = applyTerminalCommandInputAction(action, inputStateRef.current, commandHistoryRef.current);
    if (!result.supported) return { ok: false, supported: false, reason: result.reason };
    if (result.effect) {
      const { offset, viewportHeight } = scrollMetricsRef.current;
      const direction = result.effect === "page-up" ? -1 : 1;
      scrollRef.current?.scrollTo({ y: Math.max(0, offset + direction * Math.max(1, viewportHeight)), animated: true });
    } else {
      commitCommandInput(result.state);
      commandInputRef.current?.focus();
    }
    return { ok: true, supported: true };
  }, [commitCommandInput, createNewSession, language]);
  const quickActions = useMemo(() => new TerminalQuickActions(dispatchQuickAction), [dispatchQuickAction]);

  useEffect(() => {
    let mounted = true;
    void Promise.all([refreshPreferences(), selectOrCreateSession()]).catch((error: unknown) => { if (mounted) setNotice(error instanceof Error ? error.message : String(error)); });
    const unsubscribe = subscribeTerminalOutput((event: TerminalBusEvent) => {
      if (!event.sessionId || !event.data) return;
      const chunk = event.stream === "stderr" ? `\n${event.data}` : event.data;
      void getRuntimeFacade().terminalUx.appendScrollback(event.sessionId, chunk).catch(() => undefined);
      if (event.sessionId !== sessionIdRef.current) return;
      outputRef.current = `${outputRef.current}${chunk}`.slice(-24_000);
      setOutput(outputRef.current);
    });
    return () => { mounted = false; unsubscribe(); };
  }, [refreshPreferences, selectOrCreateSession]);

  useEffect(() => {
    let mounted = true;
    const catalog = quickActions.all().map((action) => action.id);
    void AsyncStorage.getItem(QUICK_ACTIONS_KEY).then((raw) => {
      if (!mounted) return;
      let ids = catalog;
      try { if (raw) { const parsed: unknown = JSON.parse(raw); if (Array.isArray(parsed)) ids = parsed.filter((id): id is TerminalQuickActionId => typeof id === "string" && catalog.includes(id as TerminalQuickActionId)); } } catch { /* corrupt preference falls back to the full allowlist */ }
      quickActions.setVisible(ids); setVisibleActions(ids); setActionsReady(true);
    }).catch(() => { if (mounted) { quickActions.setVisible(catalog); setVisibleActions(catalog); setActionsReady(true); } });
    return () => { mounted = false; };
  }, [quickActions]);

  const toggleQuickAction = useCallback(async (id: TerminalQuickActionId) => {
    const catalog = quickActions.all().map((action) => action.id);
    const current = new Set(actionsReady ? visibleActions : catalog);
    if (current.has(id)) current.delete(id); else current.add(id);
    const next = catalog.filter((item) => current.has(item));
    quickActions.setVisible(next); setVisibleActions(next); setActionsReady(true);
    await AsyncStorage.setItem(QUICK_ACTIONS_KEY, JSON.stringify(next)).catch(() => undefined);
  }, [actionsReady, quickActions, visibleActions]);

  const runCommand = useCallback(async () => {
    const input = command.trim();
    const id = sessionIdRef.current;
    if (!input || !id || busy) return;
    setBusy(true); commitCommandInput(createTerminalCommandInputState()); setNotice("");
    if (commandHistoryRef.current[0] !== input) commandHistoryRef.current = [input, ...commandHistoryRef.current].slice(0, 100);
    const prompt = `\n$ ${input}\n`;
    outputRef.current = `${outputRef.current}${prompt}`.slice(-24_000);
    setOutput(outputRef.current);
    try {
      await getRuntimeFacade().terminalUx.send(id, `${input}\n`, prompt);
      await refreshSessionRows();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const suffix = `\n[command failed: ${detail}]\n`;
      outputRef.current = `${outputRef.current}${suffix}`.slice(-24_000); setOutput(outputRef.current); setNotice(detail);
      await getRuntimeFacade().terminalUx.appendScrollback(id, suffix).catch(() => undefined);
    } finally { setBusy(false); }
  }, [busy, command, commitCommandInput, refreshSessionRows]);

  const toolbarActions = actionsReady ? quickActions.list() : quickActions.all();
  const isUnsupportedAction = (id: TerminalQuickActionId) => id === "ctrl" || id === "alt" || id === "kill-process";
  const emptyOutput = label(language, "Введите команду ниже. Выполнение остаётся в Termux/PRoot userspace.", "Введіть команду нижче. Виконання залишається в Termux/PRoot userspace.", "Enter a command below. Execution stays in the Termux/PRoot userspace context.");
  const outputSegments = useMemo(() => parseAnsiText(output || emptyOutput, theme?.ansi ?? [], theme?.foreground ?? "#E6E8EF", theme?.background ?? "#111318"), [emptyOutput, output, theme]);
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={insets.top + 12}>
    <View style={{ flex: 1, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8, paddingHorizontal: 12, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 8 }}><Ionicons name="arrow-back" size={18} color={colors.accent} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={{ color: colors.inkBright, fontWeight: "800", fontSize: 17 }}>{label(language, "Командный терминал", "Командний термінал", "Command terminal")}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10 }}>{session ? `session ${session.id} · ${session.cwd}` : `project ${projectId}`}</Text></View>
        <TouchableOpacity accessibilityLabel={label(language, "Новая сессия", "Нова сесія", "New session")} onPress={() => void createNewSession()} disabled={busy} style={{ padding: 6 }}><Ionicons name="add-circle-outline" size={23} color={colors.accent} /></TouchableOpacity>
        <TouchableOpacity accessibilityLabel={label(language, "Закрыть сессию", "Закрити сесію", "Close session")} onPress={() => void closeCurrentSession()} disabled={busy || !session} style={{ padding: 6 }}><Ionicons name="close-circle-outline" size={22} color={colors.muted} /></TouchableOpacity>
      </View>
      <Text style={{ color: colors.muted, fontSize: 11 }}>{label(language, "Команды выполняются по одной через существующий Termux adapter; это не интерактивный PTY. Вывод и контекст сессии сохраняются локально.", "Команди виконуються по одній через наявний Termux adapter; це не інтерактивний PTY. Історія зберігається локально.", "Commands run one-at-a-time through the existing Termux adapter; this is not an interactive PTY. Output and session profiles are stored locally.")}</Text>
      {sessions.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{sessions.map((row) => <TouchableOpacity key={row.id} onPress={() => void selectSession(row)} disabled={busy} style={{ borderWidth: 1, borderColor: session?.id === row.id ? colors.accent : colors.line, backgroundColor: session?.id === row.id ? colors.accentDim : colors.surface, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, opacity: busy ? 0.6 : 1 }}><Text numberOfLines={1} style={{ maxWidth: 155, color: colors.inkBright, fontSize: 10 }}>{row.cwd.split("/").pop() || row.projectId} · {row.state}</Text></TouchableOpacity>)}</ScrollView> : null}
      <ScrollView ref={scrollRef} onLayout={(event) => { scrollMetricsRef.current.viewportHeight = event.nativeEvent.layout.height; }} onScroll={(event) => { scrollMetricsRef.current.offset = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={100} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })} style={{ flex: 1, minHeight: 110, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: theme?.background ?? "#111318" }} contentContainerStyle={{ padding: 10 }}>
        <Text selectable style={{ color: theme?.foreground ?? "#E6E8EF", fontFamily: font.family, fontSize: font.size, lineHeight: font.size * font.lineHeight, letterSpacing: font.letterSpacing }}>{outputSegments.map((segment, index) => <Text key={index} style={segment.style}>{segment.text}</Text>)}</Text>
      </ScrollView>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: colors.muted, fontSize: 10, flex: 1 }}>{label(language, "Быстрые действия", "Швидкі дії", "Quick actions")}</Text>
        <TouchableOpacity onPress={() => setCustomizing((value) => !value)}><Text style={{ color: colors.accent, fontSize: 10 }}>{customizing ? label(language, "Готово", "Готово", "Done") : label(language, "Настроить", "Налаштувати", "Customize")}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setToolbarVisible((value) => !value)}><Text style={{ color: colors.accent, fontSize: 10 }}>{toolbarVisible ? label(language, "Скрыть", "Сховати", "Hide") : label(language, "Показать", "Показати", "Show")}</Text></TouchableOpacity>
      </View>
      {customizing ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>{quickActions.all().map((action) => { const visible = (actionsReady ? visibleActions : quickActions.all().map((item) => item.id)).includes(action.id); return <TouchableOpacity key={action.id} onPress={() => void toggleQuickAction(action.id)} style={{ borderWidth: 1, borderColor: visible ? colors.accent : colors.line, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5 }}><Text style={{ color: visible ? colors.inkBright : colors.muted, fontSize: 10 }}>{visible ? "✓ " : ""}{action.label}</Text></TouchableOpacity>; })}</View> : null}
      {toolbarVisible ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>{toolbarActions.map((action) => { const unsupported = isUnsupportedAction(action.id); const disabled = unsupported || (busy && action.id === "new-session"); return <TouchableOpacity key={action.id} accessibilityRole="button" accessibilityState={{ disabled }} accessibilityLabel={`${action.label}${unsupported ? label(language, ", недоступно без интерактивного PTY", ", недоступно без інтерактивного PTY", ", unavailable without an interactive PTY") : ""}`} disabled={disabled} onPress={() => void quickActions.execute(action.id).then((result) => { if (!result.supported) setNotice(result.reason ?? label(language, "Действие недоступно.", "Дія недоступна.", "Action unavailable.")); }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)))} style={{ borderWidth: 1, borderColor: action.kind === "key" ? colors.line : colors.accent, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5, opacity: unsupported ? 0.38 : busy && action.id === "new-session" ? 0.5 : 1 }}><Text style={{ color: colors.inkBright, fontSize: 10 }}>{action.label}</Text></TouchableOpacity>; })}</View> : null}
      {toolbarVisible ? <Text style={{ color: colors.muted, fontSize: 9 }}>{label(language, "Ctrl, Alt и Kill Process недоступны: адаптер не предоставляет интерактивный PTY или управляемый PID. Стрелки работают с историей/курсор команды; PgUp/PgDn — с выводом.", "Ctrl, Alt і Kill Process недоступні: адаптер не має інтерактивного PTY або керованого PID. Стрілки працюють з історією/курсор команди; PgUp/PgDn — з виводом.", "Ctrl, Alt and Kill Process are unavailable: the adapter exposes no interactive PTY or cancellable PID. Arrows edit command history/cursor; PgUp/PgDn scroll output.")}</Text> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 7 }}>
        <TextInput ref={commandInputRef} value={command} selection={commandSelection} selectionColor={theme?.selection ?? colors.accent} cursorColor={theme?.cursor ?? colors.accent} onChangeText={changeCommandInput} onSelectionChange={(event) => { const selection = event.nativeEvent.selection; const current = inputStateRef.current; commitCommandInput({ ...current, selection: { start: selection.start, end: selection.end } }); }} onSubmitEditing={() => void runCommand()} editable={!busy && Boolean(session)} multiline autoCapitalize="none" autoCorrect={false} blurOnSubmit={false} returnKeyType="send" placeholder={label(language, "Команда…", "Команда…", "Command…")} placeholderTextColor={colors.muted} style={{ flex: 1, maxHeight: 110, color: colors.inkBright, fontFamily: font.family, fontSize: font.size, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 }} />
        <TouchableOpacity onPress={() => void runCommand()} disabled={busy || !command.trim() || !session} style={{ borderRadius: 10, backgroundColor: colors.accent, padding: 11, opacity: busy || !command.trim() ? 0.5 : 1 }}><Ionicons name="play" size={18} color="#FFFFFF" /></TouchableOpacity>
      </View>
      {busy ? <Text style={{ color: colors.muted, fontSize: 10 }}>{label(language, "Выполняется…", "Виконується…", "Running…")}</Text> : null}
      {notice ? <Text selectable style={{ color: colors.muted, fontSize: 10 }}>{notice}</Text> : null}
      <TerminalPreferencesPanel colors={colors} language={language} compact onThemeChanged={setTheme} onFontChanged={setFont} />
    </View>
  </KeyboardAvoidingView>;
}
