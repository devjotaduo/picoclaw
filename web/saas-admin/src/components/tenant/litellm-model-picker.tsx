import { useMemo, useState } from "react";
import { X } from "lucide-react";

import type { PlatformLiteLLMModel } from "@/api/platform-litellm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addModelName, modelNameChoices, normalizeModelList, removeModelName } from "@/lib/model-routing";

const SELECT_CUSTOM = "__custom__";

type LiteLLMModelPickerBaseProps = {
  models: PlatformLiteLLMModel[];
  disabled?: boolean;
  loading?: boolean;
};

export function LiteLLMModelSelect({
  id,
  value,
  onChange,
  models,
  disabled,
  loading,
  placeholder = "Selecione um modelo",
}: LiteLLMModelPickerBaseProps & {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const registeredNames = useRegisteredModelNames(models);
  const choices = modelNameChoices(registeredNames, value ? [value] : []);
  const isKnownValue = !value || registeredNames.includes(value);
  const showCustomInput = customOpen || (!loading && value && !isKnownValue);

  return (
    <div className="grid gap-2">
      <Select
        value={value || undefined}
        onValueChange={(next) => {
          if (next === SELECT_CUSTOM) {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          onChange(next);
        }}
        disabled={disabled || loading}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={loading ? "Carregando modelos..." : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {choices.map((name) => (
            <SelectItem key={name} value={name}>
              <ModelOptionLabel name={name} models={models} registered={registeredNames.includes(name)} />
            </SelectItem>
          ))}
          <SelectItem value={SELECT_CUSTOM}>Personalizado...</SelectItem>
        </SelectContent>
      </Select>

      {showCustomInput ? (
        <Input
          className="h-8 text-xs"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="modelo-fora-do-catalogo"
          disabled={disabled}
        />
      ) : null}
    </div>
  );
}

export function LiteLLMModelMultiSelect({
  id,
  value,
  onChange,
  models,
  disabled,
  loading,
  placeholder,
  emptyText,
  exclude = [],
}: LiteLLMModelPickerBaseProps & {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  emptyText: string;
  exclude?: string[];
}) {
  const registeredNames = useRegisteredModelNames(models);
  const selected = normalizeModelList(value);
  const blocked = new Set([...selected, ...exclude.filter(Boolean)]);
  const available = modelNameChoices(registeredNames).filter((name) => !blocked.has(name));
  const resetKey = `${id}:${selected.join("|")}:${available.length}`;

  return (
    <div className="grid gap-2">
      <Select
        key={resetKey}
        onValueChange={(next) => onChange(addModelName(selected, next))}
        disabled={disabled || loading || available.length === 0}
      >
        <SelectTrigger id={id}>
          <SelectValue
            placeholder={
              loading
                ? "Carregando modelos..."
                : available.length === 0
                  ? "Sem modelos disponíveis"
                  : placeholder
            }
          />
        </SelectTrigger>
        <SelectContent>
          {available.map((name) => (
            <SelectItem key={name} value={name}>
              <ModelOptionLabel name={name} models={models} registered />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected.length > 0 ? (
        <div className="flex min-h-8 flex-wrap gap-1.5">
          {selected.map((name) => (
            <span
              key={name}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
            >
              <span className="truncate">{name}</span>
              <button
                type="button"
                className="rounded text-zinc-400 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-50"
                onClick={() => onChange(removeModelName(selected, name))}
                disabled={disabled}
                aria-label={`Remover ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="flex min-h-8 items-center rounded-md border border-dashed border-zinc-800 px-3 text-xs text-zinc-500">
          {emptyText}
        </div>
      )}

      {selected.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="w-fit text-zinc-400"
          onClick={() => onChange([])}
          disabled={disabled}
        >
          Limpar seleção
        </Button>
      ) : null}
    </div>
  );
}

function useRegisteredModelNames(models: PlatformLiteLLMModel[]) {
  return useMemo(
    () => normalizeModelList(models.map((model) => model.model_name)),
    [models],
  );
}

function ModelOptionLabel({
  name,
  models,
  registered,
}: {
  name: string;
  models: PlatformLiteLLMModel[];
  registered: boolean;
}) {
  const model = models.find((item) => item.model_name === name);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate font-medium">{name}</span>
      {model?.provider ? <span className="text-xs text-zinc-500">{model.provider}</span> : null}
      {!registered ? <span className="text-xs text-zinc-500">atual fora da lista</span> : null}
    </span>
  );
}
