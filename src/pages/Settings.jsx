import { Card, Form, Input, Switch, Button, Typography, message } from 'antd'

const { Title } = Typography

export default function Settings() {
  const [form] = Form.useForm()

  const onFinish = (values) => {
    console.log('Cài đặt:', values)
    message.success('Đã lưu cài đặt')
  }

  return (
    <div>
      <Title level={3}>Cài đặt</Title>
      <Card style={{ maxWidth: 480 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ siteName: 'Ant Design App', notifications: true }}
          onFinish={onFinish}
        >
          <Form.Item name="siteName" label="Tên ứng dụng" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="notifications" label="Bật thông báo" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">
              Lưu thay đổi
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
