<template>
  <div class="automation-schedule">
    <SettingsSection density="compact" :title="$t('promptAutomation.schedule')" title-id="automation-schedule">
      <SettingsRow :title="$t('automationSchedule.repeat')">
        <template #control>
          <el-select v-model="repeat" :aria-label="$t('automationSchedule.repeat')">
            <el-option v-for="kind in repeatKinds" :key="kind" :value="kind" :label="$t(`automationSchedule.${kind}`)" />
          </el-select>
        </template>
      </SettingsRow>
      <template v-if="repeat === 'interval'">
        <SettingsRow :title="$t('automationSchedule.every')">
          <template #control>
            <el-input-number v-model="intervalAmount" :min="1" :max="525600" :aria-label="$t('automationSchedule.every')" />
            <el-select v-model="intervalUnit" :aria-label="$t('automationSchedule.unit')">
              <el-option :value="1" :label="$t('automationSchedule.minutes')" />
              <el-option :value="60" :label="$t('automationSchedule.hours')" />
            </el-select>
          </template>
        </SettingsRow>
      </template>
      <template v-else-if="advanced && repeat === 'custom'">
        <SettingsRow :title="$t('automationSchedule.rule')" :description="$t('automationSchedule.advancedHelp')">
          <template #control>
            <el-input v-model="rawRule" type="textarea" :rows="3" :aria-label="$t('automationSchedule.rule')" />
          </template>
        </SettingsRow>
      </template>
      <template v-else>
        <template v-if="repeat === 'custom'">
          <SettingsRow :title="$t('automationSchedule.frequency')">
            <template #control>
              <el-select v-model="frequency" :aria-label="$t('automationSchedule.frequency')">
                <el-option v-for="freq in ['DAILY', 'WEEKLY', 'MONTHLY']" :key="freq" :value="freq" :label="$t(`automationSchedule.${freq.toLowerCase()}`)" />
              </el-select>
            </template>
          </SettingsRow>
          <SettingsRow :title="$t('automationSchedule.every')">
            <template #control>
              <el-input-number v-model="every" :min="1" :max="365" :aria-label="$t('automationSchedule.every')" />
            </template>
          </SettingsRow>
        </template>
        <SettingsRow v-if="repeat === 'weekly' || (repeat === 'custom' && frequency === 'WEEKLY')" :title="$t('automationSchedule.days')">
          <template #control>
            <el-select v-model="days" multiple :aria-label="$t('automationSchedule.days')">
              <el-option v-for="day in weekdays" :key="day.code" :value="day.code" :label="day.label" />
            </el-select>
          </template>
        </SettingsRow>
        <SettingsRow v-if="repeat === 'custom' && frequency === 'MONTHLY'" :title="$t('automationSchedule.monthDay')">
          <template #control>
            <el-input-number v-model="monthDay" :min="1" :max="31" :aria-label="$t('automationSchedule.monthDay')" />
          </template>
        </SettingsRow>
        <SettingsRow :title="$t('automationSchedule.time')">
          <template #control>
            <el-select v-model="time" filterable allow-create default-first-option :aria-label="$t('automationSchedule.time')">
              <el-option v-for="option in times" :key="option.value" :value="option.value" :label="option.label" />
            </el-select>
          </template>
        </SettingsRow>
      </template>
    </SettingsSection>
    <p v-if="!valid" class="automation-schedule__help" role="alert">{{ $t('automationSchedule.invalid') }}</p>
    <p v-else class="automation-schedule__help">{{ $t('automationSchedule.nextRun', { time: nextLabel }) }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Automation, AutomationSchedule } from '@workspace/core/contracts';
import { nextAutomationRunAt, normalizeAutomationSchedule } from '@workspace/core/automation-schedule';
import { translate } from '../i18n';
import SettingsSection from './SettingsSection.vue';
import SettingsRow from './SettingsRow.vue';

const props = defineProps<{ modelValue: AutomationSchedule; automation?: Automation | null }>();
const emit = defineEmits<{ 'update:modelValue': [schedule: AutomationSchedule] }>();
const original = props.modelValue;
const fields = 'rrule' in original ? Object.fromEntries(original.rrule.replace(/^RRULE:/i, '').split(';').map(part => part.split('='))) : {};
const repeatKinds = ['daily', 'weekdays', 'weekly', 'interval', 'custom'] as const;
type Repeat = typeof repeatKinds[number];
const advanced = ref('rrule' in original && (Object.keys(fields).some(key => !['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYHOUR', 'BYMINUTE', 'BYSECOND'].includes(key))
  || !['DAILY', 'WEEKLY', 'MONTHLY'].includes(fields.FREQ ?? '') || !/^\d+$/.test(fields.BYHOUR ?? '') || !/^\d+$/.test(fields.BYMINUTE ?? '')
  || (fields.BYSECOND !== undefined && fields.BYSECOND !== '0')
  || (fields.BYDAY !== undefined && !/^(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*$/.test(fields.BYDAY))
  || (fields.BYMONTHDAY !== undefined && !/^([1-9]|[12]\d|3[01])$/.test(fields.BYMONTHDAY))
  || (fields.FREQ !== 'WEEKLY' && fields.BYDAY !== undefined) || (fields.FREQ !== 'MONTHLY' && fields.BYMONTHDAY !== undefined)
  || (fields.FREQ === 'WEEKLY' && fields.BYDAY === undefined) || (fields.FREQ === 'MONTHLY' && fields.BYMONTHDAY === undefined)));
const initialRepeat: Repeat = 'intervalMinutes' in original ? 'interval' : advanced.value ? 'custom'
  : fields.INTERVAL && fields.INTERVAL !== '1' ? 'custom'
  : fields.FREQ === 'DAILY' ? 'daily' : fields.FREQ === 'WEEKLY' && fields.BYDAY === 'MO,TU,WE,TH,FR' ? 'weekdays'
  : fields.FREQ === 'WEEKLY' ? 'weekly' : 'custom';
const repeat = ref<Repeat>(initialRepeat);
const frequency = ref(fields.FREQ ?? 'WEEKLY');
const every = ref(Number(fields.INTERVAL ?? 1));
const days = ref((fields.BYDAY ?? 'MO').split(','));
const monthDay = ref(Number(fields.BYMONTHDAY ?? 1));
const time = ref(`${String(fields.BYHOUR ?? 9).padStart(2, '0')}:${String(fields.BYMINUTE ?? 0).padStart(2, '0')}`);
const timeZone = ref('timeZone' in original ? original.timeZone : Intl.DateTimeFormat().resolvedOptions().timeZone);
const minutes = 'intervalMinutes' in original ? original.intervalMinutes : 60;
const intervalUnit = ref(minutes % 60 === 0 ? 60 : 1);
const intervalAmount = ref(minutes / intervalUnit.value);
const rawRule = ref('rrule' in original ? original.rrule : '');
const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].map((code, index) => ({ code,
  label: new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 5 + index))) }));
const times = computed(() => {
  let zone = '';
  try { zone = new Intl.DateTimeFormat(undefined, { timeZone: timeZone.value, timeZoneName: 'short' }).formatToParts().find(part => part.type === 'timeZoneName')?.value ?? ''; } catch { /* Invalid typed zone is reported below. */ }
  return Array.from({ length: 96 }, (_, index) => {
    const hour = Math.floor(index / 4), minute = (index % 4) * 15;
    const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return { value, label: `${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 1, hour, minute)))} ${zone}` };
  });
});
const schedule = computed<AutomationSchedule>(() => {
  if (repeat.value === 'interval') return { intervalMinutes: intervalAmount.value * intervalUnit.value };
  if (repeat.value === 'custom' && advanced.value) return { rrule: rawRule.value, timeZone: timeZone.value };
  const [hour, minute] = /^([01]\d|2[0-3]):[0-5]\d$/.test(time.value) ? time.value.split(':').map(Number) : [NaN, NaN];
  const freq = repeat.value === 'custom' ? frequency.value : repeat.value === 'daily' ? 'DAILY' : 'WEEKLY';
  const parts = [`FREQ=${freq}`];
  if (repeat.value === 'custom') parts.push(`INTERVAL=${every.value}`);
  if (freq === 'WEEKLY') parts.push(`BYDAY=${repeat.value === 'weekdays' ? 'MO,TU,WE,TH,FR' : days.value.join(',')}`);
  if (freq === 'MONTHLY') parts.push(`BYMONTHDAY=${monthDay.value}`);
  parts.push(`BYHOUR=${hour}`, `BYMINUTE=${minute}`, 'BYSECOND=0');
  return { rrule: parts.join(';'), timeZone: timeZone.value };
});
watch(schedule, value => emit('update:modelValue', value));
const valid = computed(() => normalizeAutomationSchedule(props.modelValue) !== null);
const openedAt = new Date().toISOString();
const nextLabel = computed(() => {
  const unchanged = props.automation && JSON.stringify(props.modelValue) === JSON.stringify(props.automation.schedule);
  const next = nextAutomationRunAt(unchanged ? props.automation! : { schedule: props.modelValue, createdAt: openedAt });
  if (!next) return translate('automationSchedule.noNext');
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short',
    ...('timeZone' in props.modelValue ? { timeZone: props.modelValue.timeZone } : {}) }).format(new Date(next));
});
</script>

<style scoped>
.automation-schedule .el-select,
.automation-schedule .el-textarea { width: 220px; }
.automation-schedule__help {
  margin: var(--space-4) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
}
</style>
