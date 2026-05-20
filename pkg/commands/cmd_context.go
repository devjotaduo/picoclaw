package commands

import (
	"context"
	"fmt"
)

func contextCommand() Definition {
	return Definition{
		Name:        "context",
		Description: "Mostra o contexto e o uso de tokens da sessão atual",
		Usage:       "/context",
		Handler: func(_ context.Context, req Request, rt *Runtime) error {
			if rt == nil || rt.GetContextStats == nil {
				return req.Reply(unavailableMsg)
			}
			stats := rt.GetContextStats()
			if stats == nil {
				return req.Reply("Nenhum contexto de sessão ativo.")
			}
			return req.Reply(formatContextStats(stats))
		},
	}
}

func formatContextStats(s *ContextStats) string {
	remaining := s.CompressAtTokens - s.UsedTokens
	if remaining < 0 {
		remaining = 0
	}
	usedWindowPercent := s.UsedTokens * 100 / max(s.TotalTokens, 1)
	return fmt.Sprintf(
		"Uso do contexto  \nMensagens: %d  \nUsado: ~%d / %d tokens (%d%%)  \nLimite de compressão: %d tokens  \nProgresso da compressão: %d%%  \nRestante: ~%d tokens",
		s.MessageCount,
		s.UsedTokens,
		s.TotalTokens,
		usedWindowPercent,
		s.CompressAtTokens,
		s.UsedPercent,
		remaining,
	)
}
