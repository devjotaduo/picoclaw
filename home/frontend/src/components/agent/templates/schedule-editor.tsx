import { useTranslation } from "react-i18next"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import {
  type CompanyDaySchedule,
  type CompanyScheduleStructured,
  WEEK_DAYS,
  type WeekDay,
} from "./types"

interface ScheduleEditorProps {
  schedule: CompanyScheduleStructured
  onChange: (schedule: CompanyScheduleStructured) => void
}

export function ScheduleEditor({ schedule, onChange }: ScheduleEditorProps) {
  const { t } = useTranslation()

  function updateDay(day: WeekDay, patch: Partial<CompanyDaySchedule>) {
    onChange({
      ...schedule,
      [day]: { ...schedule[day], ...patch },
    })
  }

  function updateNotes(value: string) {
    onChange({ ...schedule, notes: value })
  }

  return (
    <div className="space-y-3">
      <ul className="border-border/50 bg-card/40 divide-border/30 divide-y rounded-lg border shadow-sm">
        {WEEK_DAYS.map((day) => {
          const value = schedule[day]
          return (
            <li
              key={day}
              className={cn(
                "flex items-center gap-3 px-3 py-2 transition-colors",
                !value.open && "opacity-60",
              )}
            >
              <Label className="w-28 shrink-0 text-xs font-medium tracking-wide">
                {t(`pages.agent.templates.company.schedule.days.${day}`)}
              </Label>

              <Switch
                checked={value.open}
                onCheckedChange={(open) => updateDay(day, { open })}
                aria-label={t(
                  "pages.agent.templates.company.schedule.toggle_label",
                )}
              />

              {value.open ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    type="time"
                    value={value.from}
                    onChange={(e) => updateDay(day, { from: e.target.value })}
                    className="h-8 w-[110px]"
                  />
                  <span className="text-muted-foreground text-xs">
                    {t("pages.agent.templates.company.schedule.to")}
                  </span>
                  <Input
                    type="time"
                    value={value.to}
                    onChange={(e) => updateDay(day, { to: e.target.value })}
                    className="h-8 w-[110px]"
                  />
                </div>
              ) : (
                <span className="text-muted-foreground flex-1 text-xs italic">
                  {t("pages.agent.templates.company.schedule.closed")}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium tracking-wide">
          {t("pages.agent.templates.company.schedule.notes_label")}
        </Label>
        <Textarea
          value={schedule.notes}
          onChange={(e) => updateNotes(e.target.value)}
          placeholder={t(
            "pages.agent.templates.company.schedule.notes_placeholder",
          )}
          rows={2}
        />
      </div>
    </div>
  )
}
