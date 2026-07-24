"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Search, AlertCircle, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

export default function FinancePage() {
  const [summary, setSummary] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedParty, setSelectedParty] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSummary();
      setSummary(data);
    } catch (err: any) {
      setError(err.message || "فشل تحميل الخلاصة المالية");
    } finally {
      setLoading(false);
    }
  };

  const fetchLedger = async (partyId?: string) => {
    setLedgerLoading(true);
    try {
      const data = await api.getLedger(partyId);
      setLedger(data);
    } catch (err: any) {
      console.error("Failed to fetch ledger:", err);
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    fetchLedger();
  }, []);

  const handlePartyChange = (value: string) => {
    setSelectedParty(value);
    fetchLedger(value === "ALL" ? undefined : value);
  };

  // Compute aggregate stats from summary
  const totalReceivables = Array.isArray(summary)
    ? summary.reduce((sum: number, s: any) => sum + Math.max(0, Number(s.running_balance || 0)), 0)
    : 0;
  const totalDue = Array.isArray(summary)
    ? summary.reduce((sum: number, s: any) => sum + Math.max(0, -Number(s.running_balance || 0)), 0)
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">المالية — دفتر الحسابات</h1>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              إجمالي المستحقات
            </CardTitle>
            <DollarSign className="h-4 w-4 text-gold" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold tabular">
                EGP {totalReceivables.toFixed(2)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              متأخرات
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-destructive tabular">
                EGP {totalDue.toFixed(2)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              عدد الحسابات
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold tabular">
                {Array.isArray(summary) ? summary.length : 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary Table */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">ملخص الحسابات</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            </div>
          ) : !Array.isArray(summary) || summary.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">لا توجد بيانات ملخص مالي</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">العميل</TableHead>
                  <TableHead className="text-right">الرصيد</TableHead>
                  <TableHead className="text-right">آخر حركة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((s: any, idx: number) => (
                  <TableRow key={s.party_identifier || idx}>
                    <TableCell className="font-medium">{s.party_identifier || "—"}</TableCell>
                    <TableCell className="tabular font-semibold">
                      <span className={Number(s.running_balance || 0) < 0 ? "text-destructive" : "text-success"}>
                        EGP {Number(s.running_balance || 0).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="tabular text-sm text-muted-foreground">
                      {s.last_recalculated_at ? new Date(s.last_recalculated_at).toLocaleDateString("ar-EG") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Ledger */}
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg">دفتر الحسابات</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={selectedParty || "ALL"} onValueChange={handlePartyChange}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="العميل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">الكل</SelectItem>
                  {Array.isArray(summary) &&
                    summary.map((s: any) => (
                      <SelectItem key={s.party_identifier} value={s.party_identifier}>
                        {s.party_identifier}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchLedger(selectedParty || undefined)}
                disabled={ledgerLoading}
              >
                <RefreshCw className={`h-4 w-4 ${ledgerLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {ledgerLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !Array.isArray(ledger) || ledger.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">لا توجد حركات في دفتر الحسابات</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">العميل</TableHead>
                  <TableHead className="text-right">البيان</TableHead>
                  <TableHead className="text-right">مدين</TableHead>
                  <TableHead className="text-right">دائن</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((entry: any, idx: number) => (
                  <TableRow key={entry.id || idx}>
                    <TableCell className="tabular text-sm text-muted-foreground">
                      {entry.created_at
                        ? new Date(entry.created_at).toLocaleDateString("ar-EG")
                        : "—"}
                    </TableCell>
                    <TableCell className="font-medium">{entry.party_identifier || "—"}</TableCell>
                    <TableCell className="text-sm">{entry.entry_type === "DEBIT" ? "مدين" : entry.entry_type === "CREDIT" ? "دائن" : "—"}</TableCell>
                    <TableCell className="tabular text-destructive font-semibold">
                      {entry.entry_type === "DEBIT" ? `EGP ${Number(entry.amount).toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="tabular text-success font-semibold">
                      {entry.entry_type === "CREDIT" ? `EGP ${Number(entry.amount).toFixed(2)}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

