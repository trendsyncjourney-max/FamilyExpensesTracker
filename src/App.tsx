import { Routes, Route } from 'react-router'
import Layout from './components/Layout'
import Home from './pages/Home'
import Login from './pages/Login'
import {
  Records,
  RecordDetail,
  RecordNew,
  Requests,
  RequestDetail,
  RequestNew,
  CalendarPage,
  Personal,
  More,
  Welcome,
  PageStub,
} from './pages/stubs'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/records" element={<Records />} />
        <Route path="/records/new" element={<RecordNew />} />
        <Route path="/records/:id" element={<RecordDetail />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="/requests/new" element={<RequestNew />} />
        <Route path="/requests/:id" element={<RequestDetail />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/personal" element={<Personal />} />
        <Route path="/more" element={<More />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<PageStub title="Page not found" />} />
      </Routes>
    </Layout>
  )
}
