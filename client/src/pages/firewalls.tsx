import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, MoreHorizontal, Circle, Eye } from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function FirewallsPage() {
  const queryClient = useQueryClient();
  const [approveDialog, setApproveDialog] = useState<{ open: boolean; firewall: any | null }>({ open: false, firewall: null });
  const [approveTenantId, setApproveTenantId] = useState("");
  const [approveName, setApproveName] = useState("");

  const { data: firewalls = [], isLoading } = useQuery({
    queryKey: ["firewalls"],
    queryFn: () => api.getFirewalls(),
  });

  const { data: pendingFirewalls = [] } = useQuery({
    queryKey: ["pendingFirewalls"],
    queryFn: () => api.getPendingFirewalls(),
  });

  const { data: tenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api.getTenants(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteFirewall(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["firewalls"] });
      queryClient.invalidateQueries({ queryKey: ["pendingFirewalls"] });
      toast.success("Firewall removido com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao remover firewall");
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, tenantId, name }: { id: string; tenantId: string; name?: string }) => 
      api.approveFirewall(id, tenantId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["firewalls"] });
      queryClient.invalidateQueries({ queryKey: ["pendingFirewalls"] });
      toast.success("Firewall aprovado com sucesso!");
      setApproveDialog({ open: false, firewall: null });
      setApproveTenantId("");
      setApproveName("");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao aprovar firewall");
    },
  });

  const handleApprove = () => {
    if (!approveDialog.firewall || !approveTenantId) {
      toast.error("Selecione um tenant");
      return;
    }
    approveMutation.mutate({ 
      id: approveDialog.firewall.id, 
      tenantId: approveTenantId,
      name: approveName || undefined
    });
  };

  const formatLastSeen = (lastSeen: string | null) => {
    if (!lastSeen) return "Nunca";
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Agora mesmo";
    if (diffMins < 60) return `${diffMins} min atrás`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;
    return `${Math.floor(diffHours / 24)}d atrás`;
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Firewalls</h1>
          <p className="text-muted-foreground mt-2">Monitore dispositivos OPNSense conectados.</p>
        </div>
        <Dialog open={approveDialog.open} onOpenChange={(open) => setApproveDialog({ open, firewall: open ? approveDialog.firewall : null })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Aprovar Firewall</DialogTitle>
              <DialogDescription>
                Associe este firewall a um tenant para ativá-lo.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm"><strong>Hostname:</strong> {approveDialog.firewall?.hostname}</p>
                <p className="text-sm"><strong>Serial:</strong> {approveDialog.firewall?.serialNumber}</p>
                <p className="text-sm"><strong>IP:</strong> {approveDialog.firewall?.ipAddress || "N/A"}</p>
                <p className="text-sm"><strong>Versão:</strong> {approveDialog.firewall?.version || "N/A"}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="approve-name">Nome do Firewall</Label>
                <Input
                  id="approve-name"
                  value={approveName}
                  onChange={(e) => setApproveName(e.target.value)}
                  placeholder={approveDialog.firewall?.hostname || "Nome amigável"}
                  data-testid="input-approve-name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="approve-tenant">Tenant *</Label>
                <Select value={approveTenantId} onValueChange={setApproveTenantId}>
                  <SelectTrigger data-testid="select-approve-tenant">
                    <SelectValue placeholder="Selecione um tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((tenant: any) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveDialog({ open: false, firewall: null })}>
                Cancelar
              </Button>
              <Button onClick={handleApprove} disabled={approveMutation.isPending} data-testid="button-confirm-approve">
                {approveMutation.isPending ? "Aprovando..." : "Aprovar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {pendingFirewalls.length > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardHeader>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Circle className="w-3 h-3 fill-yellow-500 text-yellow-500" />
              Aguardando Aprovação ({pendingFirewalls.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Serial</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Detectado em</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingFirewalls.map((fw: any) => (
                  <TableRow key={fw.id} data-testid={`row-pending-${fw.id}`}>
                    <TableCell className="font-medium">{fw.hostname}</TableCell>
                    <TableCell className="font-mono text-xs">{fw.serialNumber}</TableCell>
                    <TableCell className="font-mono text-xs">{fw.ipAddress || "-"}</TableCell>
                    <TableCell>{fw.version || "-"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(fw.createdAt).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        onClick={() => {
                          setApproveDialog({ open: true, firewall: fw });
                          setApproveName(fw.hostname);
                        }}
                        data-testid={`button-approve-${fw.id}`}
                      >
                        Aprovar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-medium">Inventário</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar hostname, serial..." className="pl-8" data-testid="input-search-firewalls" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : firewalls.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum firewall cadastrado ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hostname / Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Endereço IP</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Última Atualização</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {firewalls.map((fw: any) => (
                  <TableRow key={fw.id} data-testid={`row-firewall-${fw.id}`}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{fw.hostname}</span>
                        <span className="text-xs text-muted-foreground">{fw.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Circle 
                          className={`w-2 h-2 fill-current ${
                            fw.status === 'online' ? 'text-green-500' : 
                            fw.status === 'offline' ? 'text-red-500' : 
                            fw.status === 'pending' ? 'text-yellow-500' : 'text-orange-500'
                          }`} 
                        />
                        <span className="capitalize text-sm">
                          {fw.status === 'online' ? 'online' : 
                           fw.status === 'offline' ? 'offline' : 
                           fw.status === 'pending' ? 'pendente' : 'manutenção'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{fw.tenantName || "Não alocado"}</TableCell>
                    <TableCell className="font-mono text-xs">{fw.ipAddress || "-"}</TableCell>
                    <TableCell>{fw.version || "-"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatLastSeen(fw.lastSeen)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/firewalls/${fw.id}`}>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            data-testid={`button-view-${fw.id}`}
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-actions-${fw.id}`}>
                              <span className="sr-only">Abrir menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <Link href={`/firewalls/${fw.id}`}>
                              <DropdownMenuItem className="cursor-pointer">Ver Telemetria</DropdownMenuItem>
                            </Link>
                            <DropdownMenuItem>Acesso Remoto</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate(fw.id)}
                              data-testid={`button-delete-${fw.id}`}
                            >
                              Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
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
