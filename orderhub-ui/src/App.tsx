import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Table,
  Space,
  message,
  Tag,
  Popconfirm,
} from "antd";
import dayjs from "dayjs";

type Invoice = {
  orderId: string;
  amount: number;
  status: string;
  createdAt: string;
};

type CreateOrderItem = { sku: string; qty: number; unitPrice: number };
type CreateOrderReq = { customerId: string; items: CreateOrderItem[] };

const API_BILLING = import.meta.env.VITE_API_BILLING as string;
const API_ORDERS = import.meta.env.VITE_API_ORDERS as string;

export default function App() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = async (limit = 20) => {
    setLoading(true);
    try {
      const { data } = await axios.get<Invoice[]>(
        `${API_BILLING}/api/invoices`,
        { params: { limit } }
      );
      setInvoices(data);
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  const loadRecent = async (minutes = 30) => {
    setLoading(true);
    try {
      const { data } = await axios.get<Invoice[]>(
        `${API_BILLING}/api/invoices/recent`,
        { params: { minutes } }
      );
      setInvoices(data);
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to load recent invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const deleteOne = async (orderId: string) => {
    try {
      await axios.delete(`${API_BILLING}/api/invoices/${orderId}`);
      message.success(`Deleted invoice for order ${orderId}`);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Delete failed");
    }
  };

  const markPaid = async (orderId: string) => {
    try {
      await axios.patch(
        `${API_BILLING}/api/invoices/${orderId}/status`,
        { status: "PAID" },
        { headers: { "Content-Type": "application/json" } }
      );
      message.success("Marked as PAID");
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to update status");
    }
  };

  const columns = useMemo(
    () => [
      { title: "Order ID", dataIndex: "orderId", key: "orderId" as const },
      {
        title: "Amount",
        dataIndex: "amount",
        key: "amount" as const,
        render: (v: number) =>
          v.toLocaleString(undefined, { style: "currency", currency: "USD" }),
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status" as const,
        render: (s: string) =>
          s === "PAID" ? <Tag color="green">PAID</Tag> : <Tag>{s}</Tag>,
      },
      {
        title: "Created",
        dataIndex: "createdAt",
        key: "createdAt" as const,
        render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm"),
      },
      {
        title: "Actions",
        key: "actions",
        render: (_: any, rec: Invoice) => (
          <Space>
            <Button
              type="default"
              onClick={() => markPaid(rec.orderId)}
              disabled={rec.status === "PAID"}
            >
              Mark Paid
            </Button>
            <Popconfirm
              title="Delete this invoice?"
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteOne(rec.orderId)}
            >
              <Button danger>Delete</Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    []
  );

  // ----- Create Order form -----
  const [form] = Form.useForm();
  const submitOrder = async (values: any) => {
    const payload: CreateOrderReq = {
      customerId: values.customerId,
      items: [
        {
          sku: values.sku,
          qty: Number(values.qty),
          unitPrice: Number(values.unitPrice),
        },
      ],
    };
    setCreating(true);
    try {
      await axios.post(`${API_ORDERS}/api/orders`, payload, {
        headers: { "Content-Type": "application/json" },
      });
      message.success("Order created");
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Order creation failed");
    } finally {
      setCreating(false);
      form.resetFields();
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
      <h1>OrderHub Admin</h1>

      <Space style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <Button onClick={() => load()}>Refresh</Button>
        <Button onClick={() => load(5)}>Show 5</Button>
        <Button onClick={() => load(50)}>Show 50</Button>
        <Button onClick={() => loadRecent(30)}>Recent 30m</Button>
        <Button onClick={() => loadRecent(120)}>Recent 2h</Button>
      </Space>

      <Card title="Create Order" style={{ marginBottom: 24 }}>
        <Form
          form={form}
          layout="inline"
          onFinish={submitOrder}
          initialValues={{
            customerId: "11111111-1111-1111-1111-111111111111",
            qty: 1,
            unitPrice: 9.99,
          }}
        >
          <Form.Item
            name="customerId"
            label="Customer ID"
            rules={[{ required: true }]}
            style={{ minWidth: 380 }}
          >
            <Input />
          </Form.Item>
          <Form.Item name="sku" label="SKU" rules={[{ required: true }]}>
            <Input placeholder="ABC-1" style={{ width: 140 }} />
          </Form.Item>
          <Form.Item
            name="qty"
            label="Qty"
            rules={[{ required: true, type: "number", min: 1 }]}
          >
            <InputNumber min={1} />
          </Form.Item>
          <Form.Item
            name="unitPrice"
            label="Price"
            rules={[{ required: true, type: "number", min: 0.01 }]}
          >
            <InputNumber min={0.01} step={0.01} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={creating}>
              Create
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="Invoices">
        <Table
          rowKey="orderId"
          loading={loading}
          dataSource={invoices}
          columns={columns as any}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}
