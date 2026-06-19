import "server-only";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatPKR } from "@/lib/money/paisa";

/**
 * Server-side React-PDF renderer for a quotation. Pure function of its data —
 * no DB or session access. Called from the quotations service during `send`.
 */

export interface QuotationPdfData {
  agency: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    taxRegistrationNo: string | null;
  };
  quoteNumber: string;
  issuedAt: Date;
  validTill: Date | null;
  target: { name: string; email: string | null };
  items: { description: string; quantity: number; unitPricePaisa: bigint; linePaisa: bigint }[];
  subtotalPaisa: bigint;
  discountPaisa: bigint;
  taxPaisa: bigint;
  totalPaisa: bigint;
  notes: string | null;
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#1a1a1a", fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  agencyName: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  muted: { color: "#666" },
  docTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", textAlign: "right" },
  metaRight: { textAlign: "right" },
  section: { marginBottom: 16 },
  label: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  table: { marginTop: 8, borderTopWidth: 1, borderColor: "#e2e2e2" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#e2e2e2", paddingVertical: 6 },
  thRow: { flexDirection: "row", backgroundColor: "#f5f5f5", paddingVertical: 6, fontFamily: "Helvetica-Bold" },
  cDesc: { width: "52%", paddingHorizontal: 4 },
  cQty: { width: "12%", paddingHorizontal: 4, textAlign: "right" },
  cUnit: { width: "18%", paddingHorizontal: 4, textAlign: "right" },
  cLine: { width: "18%", paddingHorizontal: 4, textAlign: "right" },
  totals: { marginTop: 12, marginLeft: "auto", width: "45%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderColor: "#1a1a1a",
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
  },
  notes: { marginTop: 24, paddingTop: 8, borderTopWidth: 1, borderColor: "#e2e2e2" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#999" },
});

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function QuotationDocument({ data }: { data: QuotationPdfData }) {
  return (
    <Document title={`Quotation ${data.quoteNumber}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.agencyName}>{data.agency.name}</Text>
            {data.agency.address ? <Text style={styles.muted}>{data.agency.address}</Text> : null}
            {data.agency.phone ? <Text style={styles.muted}>{data.agency.phone}</Text> : null}
            {data.agency.email ? <Text style={styles.muted}>{data.agency.email}</Text> : null}
            {data.agency.website ? <Text style={styles.muted}>{data.agency.website}</Text> : null}
            {data.agency.taxRegistrationNo ? (
              <Text style={styles.muted}>NTN: {data.agency.taxRegistrationNo}</Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.docTitle}>QUOTATION</Text>
            <Text style={styles.metaRight}>{data.quoteNumber}</Text>
            <Text style={[styles.metaRight, styles.muted]}>Issued: {fmtDate(data.issuedAt)}</Text>
            {data.validTill ? (
              <Text style={[styles.metaRight, styles.muted]}>Valid till: {fmtDate(data.validTill)}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Prepared for</Text>
          <Text>{data.target.name}</Text>
          {data.target.email ? <Text style={styles.muted}>{data.target.email}</Text> : null}
        </View>

        <View style={styles.table}>
          <View style={styles.thRow}>
            <Text style={styles.cDesc}>Description</Text>
            <Text style={styles.cQty}>Qty</Text>
            <Text style={styles.cUnit}>Unit price</Text>
            <Text style={styles.cLine}>Amount</Text>
          </View>
          {data.items.map((it, i) => (
            <View style={styles.tr} key={i}>
              <Text style={styles.cDesc}>{it.description}</Text>
              <Text style={styles.cQty}>{it.quantity}</Text>
              <Text style={styles.cUnit}>{formatPKR(it.unitPricePaisa)}</Text>
              <Text style={styles.cLine}>{formatPKR(it.linePaisa)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>{formatPKR(data.subtotalPaisa)}</Text>
          </View>
          {data.discountPaisa > 0n ? (
            <View style={styles.totalRow}>
              <Text>Discount</Text>
              <Text>- {formatPKR(data.discountPaisa)}</Text>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <Text>Tax</Text>
            <Text>{formatPKR(data.taxPaisa)}</Text>
          </View>
          <View style={styles.grandRow}>
            <Text>Total</Text>
            <Text>{formatPKR(data.totalPaisa)}</Text>
          </View>
        </View>

        {data.notes ? (
          <View style={styles.notes}>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.muted}>{data.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          {data.agency.name} · This quotation is valid until the date shown above.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderQuotationPdf(data: QuotationPdfData): Promise<Buffer> {
  return renderToBuffer(<QuotationDocument data={data} />);
}
