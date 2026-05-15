import { IconPlus, IconTrash, IconUser } from "@tabler/icons-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

import type { TemplateProfessional, TemplateService } from "./types"

interface ProfessionalsEditorProps {
  professionals: TemplateProfessional[]
  onChange: (professionals: TemplateProfessional[]) => void
}

function emptyProfessional(): TemplateProfessional {
  return { name: "", role: "", bio: "", services: [] }
}

function emptyService(): TemplateService {
  return {
    name: "",
    details: "",
    duration: "",
    price: "",
    show_price: true,
  }
}

export function ProfessionalsEditor({
  professionals,
  onChange,
}: ProfessionalsEditorProps) {
  const { t } = useTranslation()

  function updateProfessional(
    index: number,
    patch: Partial<TemplateProfessional>,
  ) {
    onChange(
      professionals.map((prof, i) =>
        i === index ? { ...prof, ...patch } : prof,
      ),
    )
  }

  function removeProfessional(index: number) {
    onChange(professionals.filter((_, i) => i !== index))
  }

  function addProfessional() {
    onChange([...professionals, emptyProfessional()])
  }

  function updateService(
    profIndex: number,
    serviceIndex: number,
    patch: Partial<TemplateService>,
  ) {
    const prof = professionals[profIndex]
    if (!prof) return
    const nextServices = prof.services.map((service, i) =>
      i === serviceIndex ? { ...service, ...patch } : service,
    )
    updateProfessional(profIndex, { services: nextServices })
  }

  function removeService(profIndex: number, serviceIndex: number) {
    const prof = professionals[profIndex]
    if (!prof) return
    updateProfessional(profIndex, {
      services: prof.services.filter((_, i) => i !== serviceIndex),
    })
  }

  function addService(profIndex: number) {
    const prof = professionals[profIndex]
    if (!prof) return
    updateProfessional(profIndex, {
      services: [...prof.services, emptyService()],
    })
  }

  if (professionals.length === 0) {
    return (
      <div className="space-y-3">
        <div className="border-border/40 bg-muted/10 text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
          {t("pages.agent.templates.professionals.empty")}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addProfessional}
        >
          <IconPlus className="size-3.5" />
          {t("pages.agent.templates.professionals.add")}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {professionals.map((prof, profIndex) => (
        <div
          key={profIndex}
          className="border-border/50 bg-card/40 space-y-4 rounded-xl border p-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 ring-primary/20 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg ring-1">
              <IconUser className="size-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold tracking-wide uppercase opacity-70">
                    {t("pages.agent.templates.professionals.fields.name")}
                  </Label>
                  <Input
                    value={prof.name}
                    onChange={(e) =>
                      updateProfessional(profIndex, { name: e.target.value })
                    }
                    placeholder={t(
                      "pages.agent.templates.professionals.placeholders.name",
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold tracking-wide uppercase opacity-70">
                    {t("pages.agent.templates.professionals.fields.role")}
                  </Label>
                  <Input
                    value={prof.role}
                    onChange={(e) =>
                      updateProfessional(profIndex, { role: e.target.value })
                    }
                    placeholder={t(
                      "pages.agent.templates.professionals.placeholders.role",
                    )}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold tracking-wide uppercase opacity-70">
                  {t("pages.agent.templates.professionals.fields.bio")}
                </Label>
                <Textarea
                  value={prof.bio}
                  onChange={(e) =>
                    updateProfessional(profIndex, { bio: e.target.value })
                  }
                  placeholder={t(
                    "pages.agent.templates.professionals.placeholders.bio",
                  )}
                  rows={1}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => removeProfessional(profIndex)}
              className="text-muted-foreground hover:text-destructive shrink-0"
              title={t("pages.agent.templates.professionals.remove")}
            >
              <IconTrash className="size-4" />
            </Button>
          </div>

          <div className="border-border/40 ml-12 border-l-2 pl-4">
            <div className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-[0.18em] uppercase">
              {t("pages.agent.templates.professionals.service.title")}
            </div>

            {prof.services.length === 0 ? (
              <div className="border-border/30 bg-muted/5 text-muted-foreground mb-3 rounded-md border border-dashed px-3 py-4 text-center text-xs">
                {t("pages.agent.templates.professionals.service.empty")}
              </div>
            ) : (
              <ul className="mb-3 space-y-3">
                {prof.services.map((service, serviceIndex) => (
                  <li
                    key={serviceIndex}
                    className="border-border/40 bg-background/40 space-y-2 rounded-lg border p-3"
                  >
                    <div className="flex items-start gap-2">
                      <Input
                        value={service.name}
                        onChange={(e) =>
                          updateService(profIndex, serviceIndex, {
                            name: e.target.value,
                          })
                        }
                        placeholder={t(
                          "pages.agent.templates.professionals.service.placeholders.name",
                        )}
                        className="h-9 flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeService(profIndex, serviceIndex)}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        title={t(
                          "pages.agent.templates.professionals.service.remove",
                        )}
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-semibold tracking-wide uppercase opacity-70">
                          {t(
                            "pages.agent.templates.professionals.service.fields.duration",
                          )}
                        </Label>
                        <Input
                          value={service.duration}
                          onChange={(e) =>
                            updateService(profIndex, serviceIndex, {
                              duration: e.target.value,
                            })
                          }
                          placeholder="45min"
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-semibold tracking-wide uppercase opacity-70">
                          {t(
                            "pages.agent.templates.professionals.service.fields.price",
                          )}
                        </Label>
                        <Input
                          value={service.price}
                          onChange={(e) =>
                            updateService(profIndex, serviceIndex, {
                              price: e.target.value,
                            })
                          }
                          placeholder="R$ 0,00"
                          className="h-8"
                        />
                      </div>
                      <label className="flex items-center gap-2 pb-1.5 text-[11px]">
                        <Switch
                          size="sm"
                          checked={service.show_price}
                          onCheckedChange={(checked) =>
                            updateService(profIndex, serviceIndex, {
                              show_price: checked,
                            })
                          }
                        />
                        <span className="text-muted-foreground">
                          {t(
                            "pages.agent.templates.professionals.service.fields.show_price",
                          )}
                        </span>
                      </label>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold tracking-wide uppercase opacity-70">
                        {t(
                          "pages.agent.templates.professionals.service.fields.details",
                        )}
                      </Label>
                      <Textarea
                        value={service.details}
                        onChange={(e) =>
                          updateService(profIndex, serviceIndex, {
                            details: e.target.value,
                          })
                        }
                        placeholder={t(
                          "pages.agent.templates.professionals.service.placeholders.details",
                        )}
                        rows={1}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addService(profIndex)}
            >
              <IconPlus className="size-3.5" />
              {t("pages.agent.templates.professionals.service.add")}
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addProfessional}
      >
        <IconPlus className="size-3.5" />
        {t("pages.agent.templates.professionals.add")}
      </Button>
    </div>
  )
}
