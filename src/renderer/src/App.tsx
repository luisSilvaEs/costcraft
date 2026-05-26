import { HashRouter, Routes, Route, Navigate } from 'react-router'
import ProjectsPage from '@/pages/projects/ProjectsPage'
import ProjectDetailPage from '@renderer/pages/project/ProjectDetailPage'
import NewProjectPage from '@/pages/new-project/NewProjectPage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/new" element={<NewProjectPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
      </Routes>
    </HashRouter>
  )
}
