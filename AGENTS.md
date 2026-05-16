# Agent Notes

## SaaS Dev Loop

When the user asks to develop, debug, or test SaaS/controlplane/tenant launcher
work in dev mode, prefer `docker/saas/scripts/dev-sync.sh` and the
`make saas-dev-*` targets before rebuilding Docker images.

Use a Docker image rebuild only when Dockerfiles, base image layers, OS
packages, image-only assets, or durable production image validation are part of
the task.
