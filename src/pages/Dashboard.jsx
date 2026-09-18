import { Row, Col, Card, Statistic, Typography } from 'antd'
import { ArrowUpOutlined, UserOutlined, ShoppingOutlined, DollarOutlined } from '@ant-design/icons'

const { Title } = Typography

export default function Dashboard() {
  return (
    <div>
      <Title level={3}>Tổng quan</Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic title="Người dùng" value={1128} prefix={<UserOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic title="Đơn hàng" value={93} prefix={<ShoppingOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Doanh thu"
              value={11.28}
              precision={2}
              prefix={<DollarOutlined />}
              suffix={<ArrowUpOutlined style={{ fontSize: 14, color: '#3f8600' }} />}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
