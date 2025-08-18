// App.tsx
import { useEffect, useMemo, useState } from "react";
import axios, { AxiosError } from "axios";
import { Button, Card, Form, Input, InputNumber, Table, Space, message, Tooltip, Alert } from "antd";
import dayjs from "dayjs";

type Invoice = {
  id: string;           // <-- needed for pay endpoint
  orderId: string;
  amount: number;
  status: string;
  createdAt: string;
};

type CreateOrderReq = {
  customerId: string; // UUID
  items: Array<{ sku: string; qty: number; unitPrice: number }>;
};

const API_BILLING = import.meta.env.VITE_API_BILLING as string; // e.g. http://localhost:5102
const API_ORDERS  = import.meta.env.VITE_API_ORDERS  as string; // e.g. http://localhost:5101

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test((s ?? "").trim());

const makeUuid = () => {
  if (typeof globalThis !== "undefined" && (globalThis.crypto as Crypto)?.randomUUID) {
    return (globalThis.crypto as Crypto).randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis !== "undefined" && (globalThis.crypto as Crypto)?.getRandomValues) {
    (globalThis.crypto as Crypto).getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  const hex = Array.from(bytes, toHex).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};

const SKU_REGEX = /^[A-Za-z0-9-._]{2,24}$/;
const pickSku = () => ["ABC-1","ABC-2","XYZ-1","SKU-100","SKU-200"][Math.floor(Math.random()*5)];

export default function App() {
  const [form] = Form.useForm();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [limit, setLimit] = useState<number>(50);
  const [recentMinutes, setRecentMinutes] = useState<number | null>(null);
  const [svcHealth, setSvcHealth] = useState<{ orders: boolean; billing: boolean }>({ orders: true, billing: true });

  const columns = useMemo(
    () => [
      { title: "Invoice ID", dataIndex: "id", key: "id", render: (v: string) => <code>{v?.slice(0,8)}…</code> },
      { title: "Order ID", dataIndex: "orderId", key: "orderId" },
      { title: "Amount", dataIndex: "amount", key: "amount", render: (v: number) => `$${Number(v ?? 0).toFixed(2)}` },
      { title: "Status", dataIndex: "status", key: "status" },
      { title: "Created", dataIndex: "createdAt", key: "createdAt", render: (ts: string) => ts ? dayjs(ts).format("YYYY-MM-DD HH:mm") : "-" },
      {
        title: "Actions",
        key: "actions",
        render: (_: any, row: Invoice) => (
          <Space>
            <Button size="small" onClick={() => markPaid(row.id)} disabled={row.status?.toLowerCase() === "paid"}>
              Mark Paid
            </Button>
          </Space>
        ),
      },
    ],
    []
  );

  async function pingServices() {
    const tryGet = async (url: string) => {
      try { const r = await fetch(url); return r.ok; } catch { return false; }
    };
    const billingOk = await tryGet(`${API_BILLING}/health`);
    const ordersOk  = (await tryGet(`${API_ORDERS}/health`)) || (await tryGet(`${API_ORDERS}/actuator/health`));
    setSvcHealth({ orders: ordersOk, billing: billingOk });
  }

  async function fetchInvoices() {
    setLoadingInvoices(true);
    try {
      // API accepts "take", not "limit"
      const params: any = { take: limit };
      const urlPrimary = `${API_BILLING}/api/invoices`;
      const urlFallback = `${API_BILLING}/invoices`;

      let data: any;
      try {
        const res = await axios.get(urlPrimary, { params });
        data = res.data;
      } catch (err) {
        const ae = err as AxiosError;
        if (ae?.response?.status === 404) {
          const res2 = await axios.get(urlFallback, { params });
          data = res2.data;
        } else {
          throw err;
        }
      }

      let items: Invoice[] = Array.isArray(data) ? data : data?.items ?? [];
      // Client-side "recent" filter if requested
      if (recentMinutes && Number.isFinite(recentMinutes)) {
        const cutoff = dayjs().subtract(recentMinutes, "minute");
        items = items.filter(i => i?.createdAt && dayjs(i.createdAt).isAfter(cutoff));
      }
      setInvoices(items);
    } catch (err: any) {
      console.error("[fetchInvoices] error:", err);
      message.error(err?.response?.data?.message || err?.message || "Failed to load invoices");
    } finally {
      setLoadingInvoices(false);
    }
  }

  async function markPaid(invoiceId: string) {
    try {
      // Always pay by invoice GUID
      const urlPrimary = `${API_BILLING}/api/invoices/${invoiceId}/pay`;
      const urlFallback = `${API_BILLING}/invoices/${invoiceId}/pay`;

      try {
        await axios.post(urlPrimary);
      } catch (err: any) {
        if (err?.response?.status === 404) {
          await axios.post(urlFallback);
        } else {
          throw err;
        }
      }

      message.success(`Marked ${invoiceId.slice(0,8)}… as paid`);
      // Optimistic update
      setInvoices(prev =>
        prev.map(i => (i.id === invoiceId ? { ...i, status: "paid" } as Invoice : i))
      );
    } catch (err: any) {
      console.error("[markPaid] error:", err);
      message.error(err?.response?.data?.message || err?.message || "Failed to mark as paid");
    }
  }

  async function onCreate(values: any) {
    // Must be UUID (Orders expects a UUID string for customerId)
    let customerId = (values.customerId || "").trim();
    if (!customerId) {
      customerId = makeUuid();
      form.setFieldsValue({ customerId });
    } else if (!isUuid(customerId)) {
      message.error("Customer ID must be a valid UUID (36 characters).");
      return;
    }

    const sku: string = (values.sku || "").trim() || pickSku();
    const qty: number = Number(values.qty ?? 1);
    const unitPrice: number = Number(values.price ?? 9.99);

    if (!sku) return message.error("SKU is required.");
    if (!SKU_REGEX.test(sku)) return message.error("Use a valid SKU (2–24 chars: letters/digits and . - _ only).");
    if (!Number.isFinite(qty) || qty <= 0) return message.error("Quantity must be a positive number.");
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return message.error("Price must be a positive number.");

    const req: CreateOrderReq = { customerId, items: [{ sku, qty, unitPrice }] };

    try {
      setLoadingCreate(true);

      // Try /api/orders then /orders (covers both setups)
      let created: any;
      try {
        const res = await axios.post(`${API_ORDERS}/api/orders`, req);
        created = res.data;
      } catch (err: any) {
        if (err?.response?.status === 404) {
          const res2 = await axios.post(`${API_ORDERS}/orders`, req);
          created = res2.data;
        } else {
          throw err;
        }
      }

      message.success("Order created");
      form.setFieldsValue({ sku: undefined, qty: 1, price: 9.99 });

      // Optionally poll for invoice by orderId if Orders → Billing is async
      const orderId = created?.orderId ?? created?.id ?? "";
      if (orderId) {
        await waitForInvoice(orderId, 10000);
      }
      fetchInvoices();
    } catch (err: any) {
      console.error("[createOrder] error:", err);
      const status = err?.response?.status;
      const serverMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to create order";
      message.error(status ? `Create failed (${status}): ${serverMsg}` : `Create failed: ${serverMsg}`);
    } finally {
      setLoadingCreate(false);
    }
  }

  async function waitForInvoice(orderId: string, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const { data } = await axios.get(`${API_BILLING}/api/invoices`, { params: { take: 200 } });
        const items: Invoice[] = Array.isArray(data) ? data : data?.items ?? [];
        const hit = items.find(i => i.orderId === orderId);
        if (hit) return hit;
      } catch {
        // ignore transient errors while polling
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return null;
  }

  function onCreateFailed(info: any) {
    const first = info?.errorFields?.[0]?.errors?.[0];
    if (first) message.error(first);
  }

  useEffect(() => { pingServices(); }, []);
  useEffect(() => { fetchInvoices(); }, [limit, recentMinutes]);

  return (
    <div style={{ maxWidth: 1100, margin: "16px auto", padding: "0 16px" }}>
      <h1>OrderHub Admin</h1>

      {!svcHealth.orders || !svcHealth.billing ? (
        <Alert
          style={{ marginBottom: 12 }}
          type="warning"
          showIcon
          message="Service health"
          description={
            <div>
              {!svcHealth.orders  && <div>Orders (5101) is not healthy.</div>}
              {!svcHealth.billing && <div>Billing (5102) is not healthy.</div>}
              {(svcHealth.orders && svcHealth.billing) && <div>All services healthy.</div>}
            </div>
          }
        />
      ) : null}

      <Space style={{ marginBottom: 16 }} wrap>
        <Button onClick={() => fetchInvoices()}>Refresh</Button>
        <Button onClick={() => setLimit(5)}>Show 5</Button>
        <Button onClick={() => setLimit(50)}>Show 50</Button>
        <Button onClick={() => setRecentMinutes(30)}>Recent 30m</Button>
        <Button onClick={() => setRecentMinutes(120)}>Recent 2h</Button>
        <Button onClick={() => setRecentMinutes(null)}>All</Button>
      </Space>

      <Card title="Create Order" style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="inline"
          onFinish={onCreate}
          onFinishFailed={onCreateFailed}
          initialValues={{ qty: 1, price: 9.99 }}
        >
          <Form.Item
            name="customerId"
            label="Customer ID"
            tooltip="Must be a UUID. Leave blank to auto-generate."
            rules={[{ validator: (_, v) => (!v || isUuid(v) ? Promise.resolve() : Promise.reject(new Error("Enter a valid UUID (36 characters)."))) }]}
          >
            <Input
              style={{ width: 320 }}
              placeholder="e.g. 00000000-0000-0000-0000-000000000001"
              allowClear
              addonAfter={
                <Tooltip title="Generate a random UUID">
                  <a onClick={(e) => { e.preventDefault(); form.setFieldsValue({ customerId: makeUuid() }); }}>Random UUID</a>
                </Tooltip>
              }
            />
          </Form.Item>

          <Form.Item
            name="sku"
            label="SKU"
            tooltip="Product code. Try ABC-1, ABC-2, XYZ-1."
            rules={[
              { required: true, message: "SKU is required" },
              { validator: (_, v) => (!v || SKU_REGEX.test(v) ? Promise.resolve() : Promise.reject(new Error("Use 2–24 chars with letters/digits and . - _ only."))) }
            ]}
          >
            <Input
              style={{ width: 180 }}
              placeholder="ABC-1"
              addonAfter={
                <Tooltip title="Pick a demo SKU">
                  <a onClick={(e) => { e.preventDefault(); form.setFieldsValue({ sku: pickSku() }); }}>Random</a>
                </Tooltip>
              }
            />
          </Form.Item>

          <Form.Item
            name="price"
            label="Price"
            rules={[
              { required: true, message: "Price is required" },
              { validator: (_, v) => { const n = Number(v); return (!Number.isFinite(n) || n <= 0) ? Promise.reject(new Error("Use a valid positive price.")) : Promise.resolve(); } }
            ]}
          >
            <InputNumber min={0.01} step={0.01} style={{ width: 120 }} />
          </Form.Item>

          <Form.Item
            name="qty"
            label="Qty"
            rules={[
              { required: true, message: "Quantity is required" },
              { validator: (_, v) => { const n = Number(v); return (!Number.isFinite(n) || n <= 0) ? Promise.reject(new Error("Use a valid positive quantity.")) : Promise.resolve(); } }
            ]}
          >
            <InputNumber min={1} style={{ width: 90 }} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loadingCreate}>Create</Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="Invoices">
        <Table
          rowKey="id"                               // <-- identify rows by invoice id
          columns={columns as any}
          dataSource={invoices}
          loading={loadingInvoices}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <div style={{ color: "#999" }}>No data</div> }}
        />
      </Card>
    </div>
  );
}
