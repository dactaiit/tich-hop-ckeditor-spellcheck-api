import { useState } from 'react'
import { Table, Tag, Space, Button, Modal, Form, Input, Select, message, Typography, Popconfirm } from 'antd'
import { PlusOutlined } from '@ant-design/icons'

const { Title } = Typography

const initialData = [
  { key: 1, name: 'Nguyễn Văn A', email: 'a@example.com', role: 'admin', status: 'active' },
  { key: 2, name: 'Trần Thị B', email: 'b@example.com', role: 'editor', status: 'active' },
  { key: 3, name: 'Lê Văn C', email: 'c@example.com', role: 'viewer', status: 'inactive' },
]

const roleColor = { admin: 'red', editor: 'blue', viewer: 'default' }

export default function Users() {
  const [data, setData] = useState(initialData)
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()

  const handleDelete = (key) => {
    setData((prev) => prev.filter((item) => item.key !== key))
    message.success('Đã xóa người dùng')
  }

  const handleAdd = async () => {
    const values = await form.validateFields()
    setData((prev) => [...prev, { key: Date.now(), status: 'active', ...values }])
    message.success('Đã thêm người dùng')
    form.resetFields()
    setOpen(false)
  }

  const columns = [
    { title: 'Họ tên', dataIndex: 'name', key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      key: 'role',
      render: (role) => <Tag color={roleColor[role]}>{role}</Tag>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'active' ? 'green' : 'volcano'}>
          {status === 'active' ? 'Hoạt động' : 'Ngừng'}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Popconfirm title="Xóa người dùng này?" onConfirm={() => handleDelete(record.key)}>
            <Button danger size="small">
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          Người dùng
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Thêm mới
        </Button>
      </div>

      <Table columns={columns} dataSource={data} />

      <Modal
        title="Thêm người dùng"
        open={open}
        onOk={handleAdd}
        onCancel={() => setOpen(false)}
        okText="Lưu"
        cancelText="Hủy"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Họ tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Nhập email' },
              { type: 'email', message: 'Email không hợp lệ' },
            ]}
          >
            <Input placeholder="email@example.com" />
          </Form.Item>
          <Form.Item name="role" label="Vai trò" rules={[{ required: true, message: 'Chọn vai trò' }]}>
            <Select
              placeholder="Chọn vai trò"
              options={[
                { value: 'admin', label: 'Admin' },
                { value: 'editor', label: 'Editor' },
                { value: 'viewer', label: 'Viewer' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
