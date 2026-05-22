import { IconPlus, IconTrash } from "@tabler/icons-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

import type { TemplateProduct } from "./types"

interface ProductsEditorProps {
  products: TemplateProduct[]
  onChange: (products: TemplateProduct[]) => void
}

function emptyProduct(): TemplateProduct {
  return {
    name: "",
    details: "",
    price: "",
    show_price: true,
  }
}

export function ProductsEditor({ products, onChange }: ProductsEditorProps) {
  const { t } = useTranslation()

  function update(index: number, patch: Partial<TemplateProduct>) {
    onChange(
      products.map((product, i) =>
        i === index ? { ...product, ...patch } : product,
      ),
    )
  }

  function remove(index: number) {
    onChange(products.filter((_, i) => i !== index))
  }

  function add() {
    onChange([...products, emptyProduct()])
  }

  if (products.length === 0) {
    return (
      <div className="space-y-3">
        <div className="border-border/40 bg-muted/10 text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
          {t("pages.agent.templates.products.empty")}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <IconPlus className="size-3.5" />
          {t("pages.agent.templates.products.add")}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {products.map((product, index) => (
          <li
            key={index}
            className="border-border/50 bg-card/40 space-y-3 rounded-xl border p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <Label className="text-xs font-semibold tracking-wide uppercase opacity-70">
                {t("pages.agent.templates.products.fields.name")}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(index)}
                className="text-muted-foreground hover:text-destructive shrink-0"
                title={t("pages.agent.templates.products.remove")}
              >
                <IconTrash className="size-4" />
              </Button>
            </div>
            <Input
              value={product.name}
              onChange={(e) => update(index, { name: e.target.value })}
              placeholder={t(
                "pages.agent.templates.products.placeholders.name",
              )}
            />

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold tracking-wide uppercase opacity-70">
                  {t("pages.agent.templates.products.fields.price")}
                </Label>
                <Input
                  value={product.price}
                  onChange={(e) => update(index, { price: e.target.value })}
                  placeholder="R$ 0,00"
                />
              </div>
              <label className="flex items-center gap-2 pb-2 text-xs">
                <Switch
                  size="sm"
                  checked={product.show_price}
                  onCheckedChange={(checked) =>
                    update(index, { show_price: checked })
                  }
                />
                <span className="text-muted-foreground">
                  {t("pages.agent.templates.products.fields.show_price")}
                </span>
              </label>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold tracking-wide uppercase opacity-70">
                {t("pages.agent.templates.products.fields.details")}
              </Label>
              <Textarea
                value={product.details}
                onChange={(e) => update(index, { details: e.target.value })}
                placeholder={t(
                  "pages.agent.templates.products.placeholders.details",
                )}
                rows={2}
              />
            </div>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <IconPlus className="size-3.5" />
        {t("pages.agent.templates.products.add")}
      </Button>
    </div>
  )
}
