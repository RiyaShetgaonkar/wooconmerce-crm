import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { EmptyState } from './components/ui'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import CustomerProfile from './pages/CustomerProfile'
import Orders from './pages/Orders'
import FollowUps from './pages/FollowUps'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:id" element={<CustomerProfile />} />
          <Route path="orders" element={<Orders />} />
          <Route path="follow-ups" element={<FollowUps />} />
          <Route path="*" element={<EmptyState title="Page not found" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
