import { useState } from 'react'
import { useNavigate } from 'react-router'
import { FolderOpen, FilePlus } from 'lucide-react'
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

export default function ProjectsPage() {
  const navigate = useNavigate()

  // Controls the "New project" dialog visibility
  const [newDialogOpen, setNewDialogOpen] = useState(false)

  // Form fields for the new project dialog
  const [title, setTitle] = useState('')
  const [client, setClient] = useState('')

  // Tracks async operations to disable buttons during processing
  const [loading, setLoading] = useState(false)

  // ── Open existing project ──────────────────────────────────────────────────

  async function handleOpen(): Promise<void> {
    setLoading(true)
    try {
      const filePath = await window.api.project.open()

      // User cancelled the native file dialog — do nothing
      if (!filePath) return

      navigate('/projects/1')
    } finally {
      setLoading(false)
    }
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
