import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"

interface ForbiddenProps {
  message?: string
}

export function Forbidden({ message }: ForbiddenProps) {
  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">403 — Acesso negado</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        {message ??
          "Esta área é restrita a administradores da plataforma. Se você precisa de acesso, peça a um admin para promover sua conta."}
      </p>
      <Button asChild variant="outline">
        <Link to="/">Voltar para o início</Link>
      </Button>
    </div>
  )
}
