import { Navigate } from 'react-router'

// /projects/new redirects to the landing page.
// The "New project" dialog is handled directly in ProjectsPage.
export default function NewProjectPage() {
  return <Navigate to="/projects" replace />
}
