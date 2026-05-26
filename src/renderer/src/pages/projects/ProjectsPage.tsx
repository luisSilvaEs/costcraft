import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { FolderOpen, FilePlus, Clock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RecentProjectRow } from '../../../../shared/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}

const ProjectsPage = () => {
  const navigate = useNavigate()

  // Controls the "New project" dialog visibility
  const [newDialogOpen, setNewDialogOpen] = useState(false)

  // Form fields for the new project dialog
  const [title, setTitle] = useState('')
  const [client, setClient] = useState('')

  // Tracks async operations to disable buttons during processing
  const [loading, setLoading] = useState(false)

  // Recent projects loaded from app.db
  const [recents, setRecents] = useState<RecentProjectRow[]>([])

  // Load recent projects on mount
  useEffect(() => {
    window.api.app.getRecentProjects().then(setRecents).catch(console.error)
  }, [])

  // ── Open existing project ──────────────────────────────────────────────────

  async function handleOpen(): Promise<void> {
    setLoading(true)
    try {
      const result = await window.api.project.open()

      // User cancelled the native file dialog — do nothing
      if (!result) return

      navigate('/projects/1')
    } finally {
      setLoading(false)
    }
  }

  // ── Open a recent project directly (no dialog) ─────────────────────────────

  async function handleOpenRecent(filePath: string): Promise<void> {
    setLoading(true)
    try {
      const result = await window.api.project.openByPath(filePath)

      if (!result) return

      navigate('/projects/1')
    } finally {
      setLoading(false)
    }
  }

  // ── Remove a recent project from the list ──────────────────────────────────

  async function handleRemoveRecent(e: React.MouseEvent, filePath: string): Promise<void> {
    // Prevent the click from bubbling up to the card's onClick
    e.stopPropagation()

    await window.api.app.removeRecentProject(filePath)
    setRecents((prev) => prev.filter((r) => r.file_path !== filePath))
  }

  // ── Create new project ─────────────────────────────────────────────────────

  async function handleCreate(): Promise<void> {
    if (!title.trim()) return

    setLoading(true)
    try {
      const result = await window.api.project.create({
        title: title.trim(),
        client: client.trim()
      })

      // User cancelled the save dialog — do nothing
      if (!result) return

      handleDialogOpenChange(false)
      navigate('/projects/1')
    } finally {
      setLoading(false)
    }
  }

  // ── Reset dialog state when it closes ─────────────────────────────────────

  function handleDialogOpenChange(open: boolean): void {
    if (!open) {
      setTitle('')
      setClient('')
    }
    setNewDialogOpen(open)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 bg-background">
      {/* App name */}
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">CostCraft</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Budget estimation and execution tracking
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-4">
        <Button
          variant="outline"
          size="lg"
          onClick={handleOpen}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <FolderOpen className="h-5 w-5" />
          Open project
        </Button>

        <Button
          size="lg"
          onClick={() => setNewDialogOpen(true)}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <FilePlus className="h-5 w-5" />
          New project
        </Button>
      </div>

      {/* Recent projects list */}
      {recents.length > 0 && (
        <div className="w-full max-w-md">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3 w-3" />
            Recent projects
          </div>

          <ul className="flex flex-col gap-1">
            {recents.map((recent) => (
              <li key={recent.file_path}>
                <button
                  onClick={() => handleOpenRecent(recent.file_path)}
                  disabled={loading}
                  className="group relative flex w-full cursor-pointer items-center justify-between rounded-md border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {/* Project info */}
                  <div className="min-w-0 flex-1 pr-8">
                    <p className="truncate text-sm font-medium">{recent.title}</p>
                    {recent.client && (
                      <p className="truncate text-xs text-muted-foreground">{recent.client}</p>
                    )}
                  </div>

                  {/* Last opened date */}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeDate(recent.last_opened_at)}
                  </span>

                  {/* Remove button — visible on hover */}
                  <span
                    role="button"
                    aria-label="Remove from recents"
                    onClick={(e) => handleRemoveRecent(e, recent.file_path)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* New project dialog */}
      <Dialog open={newDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Project name *</Label>
              <Input
                id="title"
                placeholder="e.g. Building A — Structural works"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client">Client</Label>
              <Input
                id="client"
                placeholder="Optional"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!title.trim() || loading}>
              {loading ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ProjectsPage
