import {
  IconChevronDown,
  IconClockHour4,
  IconStar,
  IconTag,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  type ConversationFilter,
  type ConversationSort,
} from "@/lib/whatsapp/conversation-filter"

export interface ConversationFiltersProps {
  filter: ConversationFilter
  onFilterChange: (f: ConversationFilter) => void
  sort: ConversationSort
  onSortChange: (s: ConversationSort) => void
  tagOptions: readonly string[]
  selectedTag: string | null
  onSelectedTagChange: (tag: string | null) => void
  /** Counts beside each chip ("12 / 3"). */
  totalCount: number
  unreadCount: number
  pausedCount: number
  mineCount: number
}

interface ChipProps {
  active: boolean
  count: number
  onClick: () => void
  children: React.ReactNode
}

function Chip({ active, count, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-foreground/70 hover:bg-muted/70 hover:text-foreground"
      }`}
    >
      {children}
      {count > 0 && (
        <span
          className={`tabular-nums ${
            active ? "text-primary-foreground/85" : "text-foreground/70"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

export function ConversationFilters({
  filter,
  onFilterChange,
  sort,
  onSortChange,
  tagOptions,
  selectedTag,
  onSelectedTagChange,
  totalCount,
  unreadCount,
  pausedCount,
  mineCount,
}: ConversationFiltersProps) {
  const showUnread = unreadCount > 0 || filter === "unread"
  const showMine = mineCount > 0 || filter === "mine"
  const showPaused = pausedCount > 0 || filter === "paused"
  const showTags = tagOptions.length > 0 || (filter === "tag" && !!selectedTag)

  return (
    <div
      className="border-border/40 flex flex-wrap items-center gap-1.5 border-b px-3 py-2"
      role="tablist"
      aria-label="Filtros da lista de conversas"
    >
      <Chip
        active={filter === "all"}
        count={totalCount}
        onClick={() => onFilterChange("all")}
      >
        Todas
      </Chip>
      {showUnread && (
        <Chip
          active={filter === "unread"}
          count={unreadCount}
          onClick={() => onFilterChange("unread")}
        >
          Não lidas
        </Chip>
      )}
      {showMine && (
        <Chip
          active={filter === "mine"}
          count={mineCount}
          onClick={() => onFilterChange("mine")}
        >
          Minhas
        </Chip>
      )}
      {showPaused && (
        <Chip
          active={filter === "paused"}
          count={pausedCount}
          onClick={() => onFilterChange("paused")}
        >
          Pausadas
        </Chip>
      )}

      {showTags && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={filter === "tag" && selectedTag ? "default" : "ghost"}
              size="sm"
              className="h-7 gap-1 rounded-full px-2.5 text-[11px]"
              aria-label="Filtrar por tag"
            >
              <IconTag className="size-3" aria-hidden="true" />
              {filter === "tag" && selectedTag ? selectedTag : "Tag"}
              <IconChevronDown
                className="size-3 opacity-60"
                aria-hidden="true"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-72 w-52 overflow-y-auto"
          >
            <DropdownMenuLabel>Tags disponíveis</DropdownMenuLabel>
            {tagOptions.length === 0 && (
              <DropdownMenuLabel className="text-foreground/70 text-[11px] font-normal">
                Nenhuma tag encontrada
              </DropdownMenuLabel>
            )}
            {tagOptions.map((tag) => (
              <DropdownMenuCheckboxItem
                key={tag}
                checked={filter === "tag" && selectedTag === tag}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onSelectedTagChange(tag)
                    onFilterChange("tag")
                  } else {
                    onSelectedTagChange(null)
                    onFilterChange("all")
                  }
                }}
              >
                {tag}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-foreground/65 h-7 gap-1 rounded-full px-2.5 text-[11px]"
              aria-label="Ordenação"
            >
              {sort === "priority" ? (
                <IconStar className="size-3" aria-hidden="true" />
              ) : (
                <IconClockHour4 className="size-3" aria-hidden="true" />
              )}
              {sort === "priority" ? "Prioridade" : "Recente"}
              <IconChevronDown
                className="size-3 opacity-60"
                aria-hidden="true"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(v) => onSortChange(v as ConversationSort)}
            >
              <DropdownMenuRadioItem value="recent">
                Mais recentes
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="priority">
                Prioridade
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
