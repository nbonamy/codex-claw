import { computed, ref, watch, type Ref } from 'vue'
import type {
  AgentFileSearchItem,
  BackendCommandSummary,
  BackendSkillSummary,
} from '@codex-claw/shared/contracts'
import { findActiveFileMention } from './composer-mentions'
import { filterFileSearchItems } from './file-search'
import { filterComposerCommands, findActiveCommandSlash } from './composer-commands'
import { filterComposerSkills, findActiveSkillTrigger } from './composer-skills'

type ChatComposerSuggestionOptions = {
  caretPosition: Ref<number>
  commands: () => readonly BackendCommandSummary[]
  disabled: () => boolean
  files: () => readonly AgentFileSearchItem[]
  isSending: () => boolean
  onCommandSubmitted: (prompt: string) => void
  onTextInserted: (caretPosition: number) => void
  prompt: Ref<string>
  skills: () => readonly BackendSkillSummary[]
  skillsEnabled: () => boolean
  textarea: Ref<HTMLTextAreaElement | null>
}

export function useChatComposerSuggestions(options: ChatComposerSuggestionOptions) {
  const fileMenuOpen = ref(false)
  const activeFileIndex = ref(0)
  const skillMenuOpen = ref(false)
  const activeSkillIndex = ref(0)
  const slashMenuOpen = ref(false)
  const activeSlashIndex = ref(0)

  const activeFileMention = computed(() => findActiveFileMention(options.prompt.value, options.caretPosition.value))
  const visibleFiles = computed(() => {
    const mention = activeFileMention.value
    if (!mention?.query.trim()) {
      return []
    }
    return filterFileSearchItems([...options.files()], mention.query, 5)
  })
  const fileMenuShowsHint = computed(() => (
    activeFileMention.value !== null &&
    !activeFileMention.value.query.trim() &&
    options.files().length > 0
  ))
  const fileMenuVisible = computed(() => (
    fileMenuOpen.value &&
    activeFileMention.value !== null &&
    options.files().length > 0 &&
    !inputDisabled()
  ))
  const activeSkillSlash = computed(() => findActiveSkillTrigger(options.prompt.value, options.caretPosition.value, '$'))
  const visibleSkills = computed(() => filterComposerSkills([...options.skills()], activeSkillSlash.value?.query ?? ''))
  const skillMenuVisible = computed(() => (
    skillMenuOpen.value &&
    options.skillsEnabled() &&
    activeSkillSlash.value !== null &&
    options.skills().length > 0 &&
    !inputDisabled()
  ))
  const activeCommandSlash = computed(() => findActiveCommandSlash(options.prompt.value, options.caretPosition.value))
  const visibleSlashCommands = computed(() => filterComposerCommands([...options.commands()], activeCommandSlash.value?.query ?? ''))
  const visibleSlashSkills = computed(() => options.skillsEnabled()
    ? filterComposerSkills([...options.skills()], activeCommandSlash.value?.query ?? '')
    : [])
  const slashItemCount = computed(() => visibleSlashCommands.value.length + visibleSlashSkills.value.length)
  const slashMenuVisible = computed(() => (
    slashMenuOpen.value &&
    activeCommandSlash.value !== null &&
    slashItemCount.value > 0 &&
    !inputDisabled()
  ))

  watch([visibleSkills, activeSkillSlash], () => {
    activeSkillIndex.value = 0
  })
  watch([visibleSlashCommands, visibleSlashSkills, activeCommandSlash], () => {
    activeSlashIndex.value = 0
  })
  watch([visibleFiles, activeFileMention], () => {
    activeFileIndex.value = 0
  })

  function handleKeydown(event: KeyboardEvent): boolean {
    if (handleMenuKeydown(event, fileMenuVisible.value, visibleFiles.value.length, activeFileIndex, () => {
      const file = visibleFiles.value[activeFileIndex.value]
      if (file) selectFile(file)
    })) {
      return true
    }

    if (handleMenuKeydown(event, skillMenuVisible.value, visibleSkills.value.length, activeSkillIndex, () => {
      const skill = visibleSkills.value[activeSkillIndex.value]
      if (skill) selectSkill(skill)
    })) {
      return true
    }

    if (handleMenuKeydown(event, slashMenuVisible.value, slashItemCount.value, activeSlashIndex, selectActiveSlashItem)) {
      return true
    }

    return false
  }

  function handleMenuKeydown(
    event: KeyboardEvent,
    visible: boolean,
    itemCount: number,
    activeIndex: Ref<number>,
    selectActive: () => void,
  ): boolean {
    if (!visible) {
      return false
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (itemCount > 0) {
        activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + itemCount) % itemCount
      }
      return true
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return true
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && itemCount > 0) {
      event.preventDefault()
      selectActive()
      return true
    }
    return false
  }

  function selectFile(file: AgentFileSearchItem): void {
    const mention = activeFileMention.value
    if (!mention || !options.textarea.value) {
      return
    }
    insert(`${file.path} `, mention.start, mention.end)
  }

  function selectSkill(skill: BackendSkillSummary): void {
    const mention = activeSkillSlash.value
    if (mention) {
      insert(`$${skill.name} `, mention.start, mention.end)
    }
  }

  function selectSlashSkill(skill: BackendSkillSummary): void {
    const mention = activeCommandSlash.value
    if (mention) {
      insert(`/${skill.name} `, mention.start, mention.end)
    }
  }

  function selectCommand(command: BackendCommandSummary): void {
    const mention = activeCommandSlash.value
    if (!mention || !options.textarea.value) {
      return
    }

    const slashCommand = `/${command.slashName ?? command.name}`
    if (command.submitOnSelect) {
      options.prompt.value = ''
      options.caretPosition.value = 0
      close()
      options.onCommandSubmitted(slashCommand)
      return
    }
    insert(`${slashCommand} `, mention.start, mention.end)
  }

  function selectActiveSlashItem(): void {
    const command = visibleSlashCommands.value[activeSlashIndex.value]
    if (command) {
      selectCommand(command)
      return
    }
    const skill = visibleSlashSkills.value[activeSlashIndex.value - visibleSlashCommands.value.length]
    if (skill) {
      selectSlashSkill(skill)
    }
  }

  function insert(value: string, start: number, end: number): void {
    options.prompt.value = `${options.prompt.value.slice(0, start)}${value}${options.prompt.value.slice(end)}`
    const nextCaret = start + value.length
    options.caretPosition.value = nextCaret
    close()
    options.onTextInserted(nextCaret)
  }

  function updateCaretPosition(): void {
    options.caretPosition.value = options.textarea.value?.selectionEnd ?? options.prompt.value.length
    sync()
  }

  function closeSoon(): void {
    window.setTimeout(close, 120)
  }

  function close(): void {
    fileMenuOpen.value = false
    skillMenuOpen.value = false
    slashMenuOpen.value = false
  }

  function sync(): void {
    if (activeFileMention.value !== null) {
      fileMenuOpen.value = true
      skillMenuOpen.value = false
      slashMenuOpen.value = false
      return
    }
    if (activeSkillSlash.value !== null) {
      skillMenuOpen.value = true
      fileMenuOpen.value = false
      slashMenuOpen.value = false
      return
    }
    if (activeCommandSlash.value !== null) {
      slashMenuOpen.value = true
      fileMenuOpen.value = false
      skillMenuOpen.value = false
      return
    }
    close()
  }

  function inputDisabled(): boolean {
    return options.disabled() && !options.isSending()
  }

  return {
    activeFileIndex,
    activeSkillIndex,
    activeSlashIndex,
    close,
    closeSoon,
    fileMenuShowsHint,
    fileMenuVisible,
    handleKeydown,
    selectCommand,
    selectFile,
    selectSkill,
    selectSlashSkill,
    skillMenuVisible,
    slashMenuVisible,
    sync,
    updateCaretPosition,
    visibleFiles,
    visibleSkills,
    visibleSlashCommands,
    visibleSlashSkills,
  }
}
