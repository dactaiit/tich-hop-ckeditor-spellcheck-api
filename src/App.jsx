import { useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Button, theme } from 'antd'
import {
  DashboardOutlined,
  TeamOutlined,
  SettingOutlined,
  ExperimentOutlined,
  FolderOpenOutlined,
  BlockOutlined,
  LayoutOutlined,
  FileWordOutlined,
  CheckCircleOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import Dashboard from './pages/Dashboard.jsx'
import Users from './pages/Users.jsx'
import Settings from './pages/Settings.jsx'
import TestIntegration from './pages/TestIntegration.jsx'
import BlockEditor from './pages/BlockEditor.jsx'
import SectionEditor from './pages/SectionEditor.jsx'
import DocComposer from './pages/DocComposer.jsx'
import SpellCheck from './pages/SpellCheck.jsx'
import TinySpellCheck from './pages/TinySpellCheck.jsx'
import FolderBatch from './pages/FolderBatch.jsx'

const { Header, Sider, Content } = Layout

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Tổng quan' },
  { key: '/users', icon: <TeamOutlined />, label: 'Người dùng' },
  { key: '/test-integration', icon: <ExperimentOutlined />, label: 'Test tích hợp' },
  { key: '/folder-batch', icon: <FolderOpenOutlined />, label: 'Chuyển đổi thư mục' },
  { key: '/block-editor', icon: <BlockOutlined />, label: 'Sửa theo block' },
  { key: '/section-editor', icon: <LayoutOutlined />, label: 'Sửa theo section' },
  { key: '/doc-composer', icon: <FileWordOutlined />, label: 'IdaVibeEditor (demo)' },
  { key: '/spell-check', icon: <CheckCircleOutlined />, label: 'Kiểm tra chính tả' },
  { key: '/tiny-spell-check', icon: <CheckCircleOutlined />, label: 'Chính tả trên TinyMCE' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Cài đặt' },
]

export default function App() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed}>
        <div
          style={{
            height: 32,
            margin: 16,
            color: '#fff',
            fontWeight: 600,
            textAlign: 'center',
            lineHeight: '32px',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          {collapsed ? 'CE' : 'Custom Editor'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: colorBgContainer }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 16, width: 64, height: 64 }}
          />
        </Header>
        <Content
          style={{
            margin: 24,
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
          }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/users" element={<Users />} />
            <Route path="/test-integration" element={<TestIntegration />} />
            <Route path="/folder-batch" element={<FolderBatch />} />
            <Route path="/block-editor" element={<BlockEditor />} />
            <Route path="/section-editor" element={<SectionEditor />} />
            <Route path="/doc-composer" element={<DocComposer />} />
            <Route path="/spell-check" element={<SpellCheck />} />
            <Route path="/tiny-spell-check" element={<TinySpellCheck />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}
