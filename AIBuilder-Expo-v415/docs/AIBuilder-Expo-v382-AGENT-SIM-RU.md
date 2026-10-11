# AIBuilder-Expo-v382 — матрица изолированных сценариев агента

Это детерминированный host/mock стенд, а не Android/device или live-provider тест. Он использует production intent resolver, protocol parser/sanitizer, Termux command guard и guarded executor; поддельные `askModel` и `runShellCommand` bridge возвращают контролируемые ответы. Fake bridge не запускает shell-команды, не обращается к сети/провайдерам и не использует Android/Termux runtime.

Сценарии: всего 141; 9 видов intent × 10 входов = 90; 27 fake-model/fake-executor turns; 24 прямых policy/helper проверок. Результат: PASS по всем строкам.

| ID | Категория | Вход | Ожидание | Факт | Вердикт |
|---|---|---|---|---|---|
| INT-001 | intent:create_app | hello world | kind=create_app | {"kind":"create_app","name":"HelloWorld"} | PASS |
| INT-002 | intent:create_app | хело ворд | kind=create_app | {"kind":"create_app","name":"HelloWorld"} | PASS |
| INT-003 | intent:create_app | HelloWorld | kind=create_app | {"kind":"create_app","name":"HelloWorld"} | PASS |
| INT-004 | intent:create_app | сделай мне приложение калькулятор | kind=create_app | {"kind":"create_app","name":"Calculator"} | PASS |
| INT-005 | intent:create_app | напиши приложение калькулятор | kind=create_app | {"kind":"create_app","name":"Calculator"} | PASS |
| INT-006 | intent:create_app | сгенерируй игру 2048 | kind=create_app | {"kind":"create_app","name":"Game2048"} | PASS |
| INT-007 | intent:create_app | generate calculator | kind=create_app | {"kind":"create_app","name":"Calculator"} | PASS |
| INT-008 | intent:create_app | calculator | kind=create_app | {"kind":"create_app","name":"Calculator"} | PASS |
| INT-009 | intent:create_app | sozday timer | kind=create_app | {"kind":"create_app","name":"Timer"} | PASS |
| INT-010 | intent:create_app | Зроби мені калькулятор | kind=create_app | {"kind":"create_app","name":"Calculator"} | PASS |
| INT-011 | intent:build_from_path | пересобери | kind=build_from_path | {"kind":"build_from_path","variant":"debug","needsClarification":true,"missing":["path"]} | PASS |
| INT-012 | intent:build_from_path | продолжи | kind=build_from_path | {"kind":"build_from_path","variant":"debug","needsClarification":true,"missing":["path"]} | PASS |
| INT-013 | intent:build_from_path | prodolzhi | kind=build_from_path | {"kind":"build_from_path","variant":"debug","needsClarification":true,"missing":["path"]} | PASS |
| INT-014 | intent:build_from_path | продолжи сборку | kind=build_from_path | {"kind":"build_from_path","variant":"debug","needsClarification":true,"missing":["path"]} | PASS |
| INT-015 | intent:build_from_path | rebuild | kind=build_from_path | {"kind":"build_from_path","variant":"debug","needsClarification":true,"missing":["path"]} | PASS |
| INT-016 | intent:build_from_path | assembleDebug | kind=build_from_path | {"kind":"build_from_path","variant":"debug","needsClarification":true,"missing":["path"]} | PASS |
| INT-017 | intent:build_from_path | assembleRelease | kind=build_from_path | {"kind":"build_from_path","variant":"release","needsClarification":true,"missing":["path"]} | PASS |
| INT-018 | intent:build_from_path | assemble release | kind=build_from_path | {"kind":"build_from_path","variant":"release","needsClarification":true,"missing":["path"]} | PASS |
| INT-019 | intent:build_from_path | собери из архива /storage/emulated/0/AIBuilderTermux/My App.zip | kind=build_from_path | {"kind":"build_from_path","path":"/storage/emulated/0/AIBuilderTermux/My App.zip","variant":"debug"} | PASS |
| INT-020 | intent:build_from_path | build from sources /storage/emulated/0/AIBuilderTermux/Project One | kind=build_from_path | {"kind":"build_from_path","path":"/storage/emulated/0/AIBuilderTermux/Project One","variant":"debug"} | PASS |
| INT-021 | intent:analyze_sources | анализ исходников | kind=analyze_sources | {"kind":"analyze_sources","needsClarification":true,"missing":["path"]} | PASS |
| INT-022 | intent:analyze_sources | проанализируй исходники | kind=analyze_sources | {"kind":"analyze_sources","needsClarification":true,"missing":["path"]} | PASS |
| INT-023 | intent:analyze_sources | analyze source code | kind=analyze_sources | {"kind":"analyze_sources","needsClarification":true,"missing":["path"]} | PASS |
| INT-024 | intent:analyze_sources | proanaliziruy source /storage/emulated/0/AIBuilderTermux/Project A | kind=analyze_sources | {"kind":"analyze_sources","path":"/storage/emulated/0/AIBuilderTermux/Project A"} | PASS |
| INT-025 | intent:analyze_sources | review project /storage/emulated/0/AIBuilderTermux/Project B | kind=analyze_sources | {"kind":"analyze_sources","path":"/storage/emulated/0/AIBuilderTermux/Project B"} | PASS |
| INT-026 | intent:analyze_sources | розібр исходники /storage/emulated/0/AIBuilderTermux/Проєкт | kind=analyze_sources | {"kind":"analyze_sources","path":"/storage/emulated/0/AIBuilderTermux/Проєкт"} | PASS |
| INT-027 | intent:analyze_sources | проаналізуй исходники /storage/emulated/0/AIBuilderTermux/Sources | kind=analyze_sources | {"kind":"analyze_sources","path":"/storage/emulated/0/AIBuilderTermux/Sources"} | PASS |
| INT-028 | intent:analyze_sources | изучи проект /storage/emulated/0/AIBuilderTermux/App | kind=analyze_sources | {"kind":"analyze_sources","path":"/storage/emulated/0/AIBuilderTermux/App"} | PASS |
| INT-029 | intent:analyze_sources | посмотри исходники /storage/emulated/0/AIBuilderTermux/App | kind=analyze_sources | {"kind":"analyze_sources","path":"/storage/emulated/0/AIBuilderTermux/App"} | PASS |
| INT-030 | intent:analyze_sources | mixed review исходники /storage/emulated/0/AIBuilderTermux/Code | kind=analyze_sources | {"kind":"analyze_sources","path":"/storage/emulated/0/AIBuilderTermux/Code"} | PASS |
| INT-031 | intent:analyze_and_fix | исправь до конца | kind=analyze_and_fix | {"kind":"analyze_and_fix","until":"apk","needsClarification":true,"missing":["path"]} | PASS |
| INT-032 | intent:analyze_and_fix | fix all errors | kind=analyze_and_fix | {"kind":"analyze_and_fix","until":"report","needsClarification":true,"missing":["path"]} | PASS |
| INT-033 | intent:analyze_and_fix | исправь ошибку сборки /storage/emulated/0/AIBuilderTermux/App | kind=analyze_and_fix | {"kind":"analyze_and_fix","path":"/storage/emulated/0/AIBuilderTermux/App","until":"apk"} | PASS |
| INT-034 | intent:analyze_and_fix | ispravi error build /storage/emulated/0/AIBuilderTermux/Project | kind=analyze_and_fix | {"kind":"analyze_and_fix","path":"/storage/emulated/0/AIBuilderTermux/Project","until":"report"} | PASS |
| INT-035 | intent:analyze_and_fix | почини ошибки в проекте /storage/emulated/0/AIBuilderTermux/Code | kind=analyze_and_fix | {"kind":"analyze_and_fix","path":"/storage/emulated/0/AIBuilderTermux/Code","until":"report"} | PASS |
| INT-036 | intent:analyze_and_fix | analyze and fix /storage/emulated/0/AIBuilderTermux/App | kind=analyze_and_fix | {"kind":"analyze_and_fix","path":"/storage/emulated/0/AIBuilderTermux/App","until":"report"} | PASS |
| INT-037 | intent:analyze_and_fix | проанализируй и исправь ошибки /storage/emulated/0/AIBuilderTermux/Проект | kind=analyze_and_fix | {"kind":"analyze_and_fix","path":"/storage/emulated/0/AIBuilderTermux/Проект","until":"report"} | PASS |
| INT-038 | intent:analyze_and_fix | исправь все ошибки в исходниках /storage/emulated/0/AIBuilderTermux/Src | kind=analyze_and_fix | {"kind":"analyze_and_fix","path":"/storage/emulated/0/AIBuilderTermux/Src","until":"report"} | PASS |
| INT-039 | intent:analyze_and_fix | fix all errors until APK /storage/emulated/0/AIBuilderTermux/Source | kind=analyze_and_fix | {"kind":"analyze_and_fix","path":"/storage/emulated/0/AIBuilderTermux/Source","until":"apk"} | PASS |
| INT-040 | intent:analyze_and_fix | исправь до конца сборку /storage/emulated/0/AIBuilderTermux/Проект | kind=analyze_and_fix | {"kind":"analyze_and_fix","path":"/storage/emulated/0/AIBuilderTermux/Проект","until":"apk"} | PASS |
| INT-041 | intent:adb | adb devices | kind=adb | {"kind":"adb","action":"devices"} | PASS |
| INT-042 | intent:adb | list devices over adb | kind=adb | {"kind":"adb","action":"devices"} | PASS |
| INT-043 | intent:adb | podklyuchis po adb | kind=adb | {"kind":"adb","action":"connect"} | PASS |
| INT-044 | intent:adb | adb pair 192.0.2.2:37123 | kind=adb | {"kind":"adb","action":"pair"} | PASS |
| INT-045 | intent:adb | adb connect 192.0.2.2:37123 | kind=adb | {"kind":"adb","action":"connect"} | PASS |
| INT-046 | intent:adb | adb logcat | kind=adb | {"kind":"adb","action":"logcat"} | PASS |
| INT-047 | intent:adb | сделай screenshot по adb | kind=adb | {"kind":"adb","action":"screenshot"} | PASS |
| INT-048 | intent:adb | install apk | kind=adb | {"kind":"adb","action":"install"} | PASS |
| INT-049 | intent:adb | установи последний apk | kind=adb | {"kind":"adb","action":"install"} | PASS |
| INT-050 | intent:adb | pm list packages на устройстве | kind=adb | {"kind":"adb","action":"list_packages"} | PASS |
| INT-051 | intent:diagnose | диагностика | kind=diagnose | {"kind":"diagnose"} | PASS |
| INT-052 | intent:diagnose | prover sdk | kind=diagnose | {"kind":"diagnose"} | PASS |
| INT-053 | intent:diagnose | проверь java | kind=diagnose | {"kind":"diagnose"} | PASS |
| INT-054 | intent:diagnose | check sdk | kind=diagnose | {"kind":"diagnose"} | PASS |
| INT-055 | intent:diagnose | check java | kind=diagnose | {"kind":"diagnose"} | PASS |
| INT-056 | intent:diagnose | toolchain status | kind=diagnose | {"kind":"diagnose"} | PASS |
| INT-057 | intent:diagnose | health check | kind=diagnose | {"kind":"diagnose"} | PASS |
| INT-058 | intent:diagnose | diagnostics environment | kind=diagnose | {"kind":"diagnose"} | PASS |
| INT-059 | intent:diagnose | проверка среды | kind=diagnose | {"kind":"diagnose"} | PASS |
| INT-060 | intent:diagnose | что установлено | kind=diagnose | {"kind":"diagnose"} | PASS |
| INT-061 | intent:reverse_apk | реверс apk | kind=reverse_apk | {"kind":"reverse_apk","needsClarification":true,"missing":["path"]} | PASS |
| INT-062 | intent:reverse_apk | разбери apk | kind=reverse_apk | {"kind":"reverse_apk","needsClarification":true,"missing":["path"]} | PASS |
| INT-063 | intent:reverse_apk | dekompiliruy apk | kind=reverse_apk | {"kind":"reverse_apk","needsClarification":true,"missing":["path"]} | PASS |
| INT-064 | intent:reverse_apk | jadx apk | kind=reverse_apk | {"kind":"reverse_apk","needsClarification":true,"missing":["path"]} | PASS |
| INT-065 | intent:reverse_apk | smali анализ | kind=reverse_apk | {"kind":"reverse_apk","needsClarification":true,"missing":["path"]} | PASS |
| INT-066 | intent:reverse_apk | reverse engineer /storage/emulated/0/AIBuilderTermux/app.apk | kind=reverse_apk | {"kind":"reverse_apk","path":"/storage/emulated/0/AIBuilderTermux/app.apk"} | PASS |
| INT-067 | intent:reverse_apk | разбор apk /storage/emulated/0/AIBuilderTermux/app.apk | kind=reverse_apk | {"kind":"reverse_apk","path":"/storage/emulated/0/AIBuilderTermux/app.apk"} | PASS |
| INT-068 | intent:reverse_apk | что внутри apk | kind=reverse_apk | {"kind":"reverse_apk","needsClarification":true,"missing":["path"]} | PASS |
| INT-069 | intent:reverse_apk | inspect apk /storage/emulated/0/AIBuilderTermux/app.apk | kind=reverse_apk | {"kind":"reverse_apk","path":"/storage/emulated/0/AIBuilderTermux/app.apk"} | PASS |
| INT-070 | intent:reverse_apk | analyze apk | kind=reverse_apk | {"kind":"reverse_apk","needsClarification":true,"missing":["path"]} | PASS |
| INT-071 | intent:ndk_install | установи ndk | kind=ndk_install | {"kind":"ndk_install"} | PASS |
| INT-072 | intent:ndk_install | ustanovi ndk | kind=ndk_install | {"kind":"ndk_install"} | PASS |
| INT-073 | intent:ndk_install | поставь ndk | kind=ndk_install | {"kind":"ndk_install"} | PASS |
| INT-074 | intent:ndk_install | скачай ndk | kind=ndk_install | {"kind":"ndk_install"} | PASS |
| INT-075 | intent:ndk_install | download ndk | kind=ndk_install | {"kind":"ndk_install"} | PASS |
| INT-076 | intent:ndk_install | setup ndk | kind=ndk_install | {"kind":"ndk_install"} | PASS |
| INT-077 | intent:ndk_install | налаштуй ndk | kind=ndk_install | {"kind":"ndk_install"} | PASS |
| INT-078 | intent:ndk_install | установи android ndk | kind=ndk_install | {"kind":"ndk_install"} | PASS |
| INT-079 | intent:ndk_install | install android ndk | kind=ndk_install | {"kind":"ndk_install"} | PASS |
| INT-080 | intent:ndk_install | download the NDK | kind=ndk_install | {"kind":"ndk_install"} | PASS |
| INT-081 | intent:generic | hello | kind=generic | {"kind":"generic"} | PASS |
| INT-082 | intent:generic | spasibo | kind=generic | {"kind":"generic"} | PASS |
| INT-083 | intent:generic | what is an APK? | kind=generic | {"kind":"generic"} | PASS |
| INT-084 | intent:generic | как дела | kind=generic | {"kind":"generic"} | PASS |
| INT-085 | intent:generic | поясни что такое Java | kind=generic | {"kind":"generic"} | PASS |
| INT-086 | intent:generic | tell me a short joke | kind=generic | {"kind":"generic"} | PASS |
| INT-087 | intent:generic | дякую | kind=generic | {"kind":"generic"} | PASS |
| INT-088 | intent:generic | how are you today | kind=generic | {"kind":"generic"} | PASS |
| INT-089 | intent:generic | что значит слово build | kind=generic | {"kind":"generic"} | PASS |
| INT-090 | intent:generic | привет, расскажи о погоде | kind=generic | {"kind":"generic"} | PASS |
| SIM-001 | fake-agent-turn | Read current working directory | executed-fake-only exitCode=0 | {"status":"executed-fake-only","command":"pwd","stdout":"/data/data/com.termux/files/home","exitCode":0,"modelCalls":1,"executorCalls":1,"bridgeCommand":"bash -c 'AIB_PRIVATE_ROOT=\"$HOME/.aibuilder\"; export AIB_PRIVATE_ROOT; pwd' 2> >(while IFS= read -r line \|\| [ -n \"$line\" ]; do printf '__AIB_STDERR__%s\\n' \"$line\"; done)"} | PASS |
| SIM-002 | fake-agent-turn | List a fixture path | executed-fake-only exitCode=2 | {"status":"executed-fake-only","command":"ls -la","stdout":"","stderr":"fixture denied","exitCode":2,"modelCalls":1,"executorCalls":1,"bridgeCommand":"bash -c 'AIB_PRIVATE_ROOT=\"$HOME/.aibuilder\"; export AIB_PRIVATE_ROOT; ls -la' 2> >(while IFS= read -r line \|\| [ -n \"$line\" ]; do printf '__AIB_STDERR__%s\\n' \"$line\"; done)"} | PASS |
| SIM-003 | fake-agent-turn | An empty command response | executed-fake-only empty stdout exitCode=0 | {"status":"executed-fake-only","command":"pwd","stdout":"","stderr":"","exitCode":0,"modelCalls":1,"executorCalls":1,"bridgeCommand":"bash -c 'AIB_PRIVATE_ROOT=\"$HOME/.aibuilder\"; export AIB_PRIVATE_ROOT; pwd' 2> >(while IFS= read -r line \|\| [ -n \"$line\" ]; do printf '__AIB_STDERR__%s\\n' \"$line\"; done)"} | PASS |
| SIM-004 | fake-agent-turn | A timed out command | executed-fake-only timedOut=true | {"status":"executed-fake-only","command":"pwd","stdout":"partial","exitCode":124,"timedOut":true,"modelCalls":1,"executorCalls":1,"bridgeCommand":"bash -c 'AIB_PRIVATE_ROOT=\"$HOME/.aibuilder\"; export AIB_PRIVATE_ROOT; pwd' 2> >(while IFS= read -r line \|\| [ -n \"$line\" ]; do printf '__AIB_STDERR__%s\\n' \"$line\"; done)"} | PASS |
| SIM-005 | fake-agent-turn | A huge fake stdout | large stdout compressed by production executor | {"status":"executed-fake-only","command":"cat README.md","stdout":"[FAKE_OUTPUT_COMPRESSED]","exitCode":0,"modelCalls":1,"executorCalls":1,"bridgeCommand":"bash -c 'AIB_PRIVATE_ROOT=\"$HOME/.aibuilder\"; export AIB_PRIVATE_ROOT; cat README.md' 2> >(while IFS= read -r line \|\| [ -n \"$line\" ]; do printf '__AIB_STDERR__%s\\n' \"$line\"; done)"} | PASS |
| SIM-006 | fake-agent-turn | Separate stdout and stderr marker | stdout=OUT; stderr=WARN | {"status":"executed-fake-only","command":"pwd","stdout":"OUT","stderr":"WARN","exitCode":0,"modelCalls":1,"executorCalls":1,"bridgeCommand":"bash -c 'AIB_PRIVATE_ROOT=\"$HOME/.aibuilder\"; export AIB_PRIVATE_ROOT; pwd' 2> >(while IFS= read -r line \|\| [ -n \"$line\" ]; do printf '__AIB_STDERR__%s\\n' \"$line\"; done)"} | PASS |
| SIM-007 | fake-agent-turn | Provider timeout | model-error and no executor | {"status":"model-error","message":"MODEL_TIMEOUT","modelCalls":1,"executorCalls":0} | PASS |
| SIM-008 | fake-agent-turn | Empty model answer | final-no-command and no executor | {"status":"final-no-command","message":"","modelCalls":1,"executorCalls":0} | PASS |
| SIM-009 | fake-agent-turn | Ordinary prose must not run shell | final-no-command and no executor | {"status":"final-no-command","message":"Hello, I can explain that.","modelCalls":1,"executorCalls":0} | PASS |
| SIM-010 | fake-agent-turn | Unmarked JSON tool payload | unmarked JSON rejected | {"status":"unmarked-json-not-executed","modelCalls":1,"executorCalls":0} | PASS |
| SIM-011 | fake-agent-turn | JSON without protocol marker | final-no-command and no executor | {"status":"final-no-command","message":"{\"command\":\"pwd\"}","modelCalls":1,"executorCalls":0} | PASS |
| SIM-012 | fake-agent-turn | Markdown fenced command | one safe pwd executed | {"status":"executed-fake-only","command":"pwd","stdout":"ok","exitCode":0,"modelCalls":1,"executorCalls":1,"bridgeCommand":"bash -c 'AIB_PRIVATE_ROOT=\"$HOME/.aibuilder\"; export AIB_PRIVATE_ROOT; pwd' 2> >(while IFS= read -r line \|\| [ -n \"$line\" ]; do printf '__AIB_STDERR__%s\\n' \"$line\"; done)"} | PASS |
| SIM-013 | fake-agent-turn | Reasoning tags around command | think removed; one safe pwd executed | {"status":"executed-fake-only","command":"pwd","stdout":"ok","exitCode":0,"modelCalls":1,"executorCalls":1,"bridgeCommand":"bash -c 'AIB_PRIVATE_ROOT=\"$HOME/.aibuilder\"; export AIB_PRIVATE_ROOT; pwd' 2> >(while IFS= read -r line \|\| [ -n \"$line\" ]; do printf '__AIB_STDERR__%s\\n' \"$line\"; done)"} | PASS |
| SIM-014 | fake-agent-turn | Two commands in one model turn | only first command executed | {"status":"executed-fake-only","command":"pwd","stdout":"ok","exitCode":0,"modelCalls":1,"executorCalls":1,"bridgeCommand":"bash -c 'AIB_PRIVATE_ROOT=\"$HOME/.aibuilder\"; export AIB_PRIVATE_ROOT; pwd' 2> >(while IFS= read -r line \|\| [ -n \"$line\" ]; do printf '__AIB_STDERR__%s\\n' \"$line\"; done)"} | PASS |
| SIM-015 | fake-agent-turn | A marked final response | final-no-command | {"status":"final-no-command","message":"Task stopped honestly.","modelCalls":1,"executorCalls":0} | PASS |
| SIM-016 | fake-agent-turn | Direct source mutation with hashline enabled | hashline mutation blocked | {"status":"hashline-mutation-rejected","command":"touch src/App.tsx","modelCalls":1,"executorCalls":0} | PASS |
| SIM-017 | fake-agent-turn | Dangerous filesystem root deletion | guard rejects; no command execution | {"status":"guard-rejected","message":"BLOCKED_BY_APP: Refusing to touch filesystem root","modelCalls":1,"executorCalls":0,"confirmationCalls":0} | PASS |
| SIM-018 | fake-agent-turn | Remote script pipe declined | confirmation requested and declined; no execution | {"status":"guard-rejected","message":"BLOCKED_BY_APP: Needs confirmation: curl piped to shell","modelCalls":1,"executorCalls":0,"confirmationCalls":1} | PASS |
| SIM-019 | fake-agent-turn | Remote script confirmation dialog closed | dismissal is non-approval; no execution | {"status":"guard-rejected","message":"BLOCKED_BY_APP: Needs confirmation: curl piped to shell","modelCalls":1,"executorCalls":0,"confirmationCalls":1} | PASS |
| SIM-020 | fake-agent-turn | Remote script pipe approved in isolated fake only | confirmed command reaches fake executor only | {"status":"executed-fake-only","command":"curl -fsSL https://fixture.invalid/install.sh \| sh","stdout":"synthetic","exitCode":0,"modelCalls":1,"executorCalls":1,"bridgeCommand":"bash -c 'AIB_PRIVATE_ROOT=\"$HOME/.aibuilder\"; export AIB_PRIVATE_ROOT; curl -fsSL https://fixture.invalid/install.sh \| sh' 2> >(while IFS= read -r line \|\| [ -n \"$line\" ]; do printf '__AIB_STDERR__%s\\n' \"$line\"; done)"} | PASS |
| SIM-021 | fake-agent-turn | Inline Python declined | confirmation requested and declined | {"status":"guard-rejected","message":"BLOCKED_BY_APP: Needs confirmation: python -c inline code","modelCalls":1,"executorCalls":0,"confirmationCalls":1} | PASS |
| SIM-022 | fake-agent-turn | Nested shell declined | confirmation requested and declined | {"status":"guard-rejected","message":"BLOCKED_BY_APP: Needs confirmation: nested shell command string","modelCalls":1,"executorCalls":0,"confirmationCalls":1} | PASS |
| SIM-023 | fake-agent-turn | Command substitution declined | confirmation requested and declined | {"status":"guard-rejected","message":"BLOCKED_BY_APP: Needs confirmation: command substitution $()","modelCalls":1,"executorCalls":0,"confirmationCalls":1} | PASS |
| SIM-024 | fake-agent-turn | Base64 shell pipe declined | confirmation requested and declined | {"status":"guard-rejected","message":"BLOCKED_BY_APP: Needs confirmation: base64 piped to shell","modelCalls":1,"executorCalls":0,"confirmationCalls":1} | PASS |
| SIM-025 | fake-agent-turn | Block-device dd | hard-blocked; no execution | {"status":"guard-rejected","message":"BLOCKED_BY_APP: Blocked: output target is outside trusted roots: /dev/sda","modelCalls":1,"executorCalls":0,"confirmationCalls":0} | PASS |
| SIM-026 | fake-agent-turn | Path traversal write | path traversal blocked | {"status":"guard-rejected","message":"BLOCKED_BY_APP: Path traversal is not allowed in filesystem operation","modelCalls":1,"executorCalls":0,"confirmationCalls":0} | PASS |
| SIM-027 | fake-agent-turn | Write outside app-owned root | outside path blocked or confirmation rejected | {"status":"guard-rejected","message":"BLOCKED_BY_APP: Blocked: output target is outside trusted roots: /storage/emulated/0/Documents/escape.txt","modelCalls":1,"executorCalls":0,"confirmationCalls":0} | PASS |
| SIM-028 | agent-policy-helper | missing dangerous-mode value | false | false | PASS |
| SIM-029 | agent-policy-helper | explicit false dangerous-mode value | false | false | PASS |
| SIM-030 | agent-policy-helper | explicit true dangerous-mode value | true | true | PASS |
| SIM-031 | agent-policy-helper | string true is not an explicit boolean opt-in | false | false | PASS |
| SIM-032 | agent-policy-helper | safe command fingerprint normalization | equal fingerprints | true | PASS |
| SIM-033 | agent-policy-helper | invalid protocol reply retry limit | retry=2 true; retry=3 false | true;false | PASS |
| SIM-034 | agent-policy-helper | unmarked JSON detection | tool-shaped JSON detected | true | PASS |
| SIM-035 | agent-policy-helper | read-only allowlisted pwd | allowed | true | PASS |
| SIM-036 | agent-policy-helper | read-only traversal | rejected | false | PASS |
| SIM-037 | agent-policy-helper | direct mutation detection | git status read-only; touch mutation | false;true | PASS |
| SIM-038 | agent-policy-helper | large result truncation | <= 1100 chars with truncation marker | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx<br>… (обрезано, ещё 200 симв.) | PASS |
| SIM-039 | agent-policy-helper | agent callsite dangerous-mode fail-closed wiring | explicit opt-in helper used at shell boundary | true | PASS |
| SIM-040 | agent-policy-helper | recorded-format Gradle log: first What went wrong beats noisy tail | root cause contains the original task error, not the tail | Execution failed for task ':app:compileDebugKotlin'. Could not resolve symbol from source. | PASS |
| SIM-041 | agent-policy-helper | recorded-format missing JDK diagnostic | toolchain/java classification; host allowlisted recipe only | {"phase":"toolchain","category":"java-runtime-missing","fingerprint":"toolchain\|java-runtime-missing\|java_not_found: java executable missing on active backend","strategy":"inspect-active-build-backend; use-only-the-host-allowlisted-java-install-recipe-if-needed; export-JAVA_HOME; verify-java-version; retry-once","evidence":"FIRST_ROOT_CAUSE: JAVA_NOT_FOUND: java executable missing on active backend \| JAVA_NOT_FOUND: java executable missing on active backend"} | PASS |
| SIM-042 | agent-policy-helper | anti-stuck missing Java | uses java-install recipe ID, never raw pkg/apt shell | java-install:false:true | PASS |
| SIM-043 | agent-policy-helper | anti-stuck missing sdkmanager | v389: install it with sdkmanager; do not force-stop | null:false:true | PASS |
| SIM-044 | agent-policy-helper | recovery toolchain hints use trusted recipe IDs | JDK and Gradle hints are IDs, not raw package commands | java-install:gradle-pkg:false:false | PASS |
| SIM-045 | agent-policy-helper | missing Android SDK does not get a fake repair hint | no local.properties workaround when SDK is absent | 0 | PASS |
| SIM-046 | agent-policy-helper | recorded-format shared-storage path denial | prepare failure + immediate storage blocker | prepare:storage-access-denied | PASS |
| SIM-047 | agent-policy-helper | recorded-format network outage | explicit network blocker | {"code":"network-unavailable","evidence":"curl: (7) Network is unreachable"} | PASS |
| SIM-048 | agent-policy-helper | same root-cause fingerprint guard | second identical fingerprint is recognized | true | PASS |
| SIM-049 | agent-policy-helper | learned recovery memory stores only recipe ID and backend | verified recipe hits on same backend only | java-install:null | PASS |
| SIM-050 | agent-policy-helper | APK candidate passes only with identity, signature evidence, final marker, and successful exit | size, full identity/signature evidence, verified marker, and exit=0 required | true:false:false | PASS |
| SIM-051 | agent-policy-helper | APK validation uses real archive and signature tools, never sdkmanager | ZIP test + apksigner verify + no SDK installation | true:true:false | PASS |

## Границы доказательств

Матрица подтверждает только перечисленные source-level intents, protocol gates, guarded-executor decisions и обработку fake result. Она не выполняет полный `runTermuxAgentTask` orchestration на Android, не покрывает каждую кнопку/каждый инструмент и не заменяет отдельные реестры/25 tool chains/полную матрицу package ID из Prompt.txt.
