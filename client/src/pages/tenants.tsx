import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, MoreHorizontal } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function TenantsPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: "", contactEmail: "" });

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api.getTenants(),
  });

  const { data: firewalls = [] } = useQuery({
    queryKey: ["firewalls"],
    queryFn: () => api.getFirewalls(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; contactEmail: string }) => api.createTenant(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Tenant criado com sucesso!");
      setIsDialogOpen(false);
      setNewTenant({ name: "", contactEmail: "" });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar tenant");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteTenant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Tenant removido com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao remover tenant");
    },
  });

  const getFirewallCount = (tenantId: string) => {
    return firewalls.filter((fw: any) => fw.tenantId === tenantId).length;
  };

  const handleCreate = () => {
    if (!newTenant.name || !newTenant.contactEmail) {
      toast.error("Preencha todos os campos");
      return;
    }
    createMutation.mutate(newTenant);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Tenants</h1>
          <p className="text-muted-foreground mt-2">Gerencie ambientes de clientes e organizações.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-new-tenant">
              <Plus className="w-4 h-4" />
              Novo Tenant
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Tenant</DialogTitle>
              <DialogDescription>
                Adicione um novo cliente ou organização ao sistema.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                  placeholder="Acme Corp"
                  data-testid="input-tenant-name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email de Contato</Label>
                <Input
                  id="email"
                  type="email"
                  value={newTenant.contactEmail}
                  onChange={(e) => setNewTenant({ ...newTenant, contactEmail: e.target.value })}
                  placeholder="admin@acme.com"
                  data-testid="input-tenant-email"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-save-tenant">
                {createMutation.isPending ? "Criando..." : "Criar Tenant"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-medium">Todos os Tenants</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar tenants..." className="pl-8" data-testid="input-search-tenants" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : tenants.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum tenant cadastrado ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Firewalls</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant: any) => (
                  <TableRow key={tenant.id} data-testid={`row-tenant-${tenant.id}`}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell>{tenant.contactEmail}</TableCell>
                    <TableCell>{getFirewallCount(tenant.id)}</TableCell>
                    <TableCell>
                      <Badge variant={tenant.status === "active" ? "default" : "secondary"}>
                        {tenant.status === "active" ? "ativo" : "inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-actions-${tenant.id}`}>
                            <span className="sr-only">Abrir menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuItem>Ver detalhes</DropdownMenuItem>
                          <DropdownMenuItem>Editar tenant</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(tenant.id)}
                            data-testid={`button-delete-${tenant.id}`}
                          >
                            Remover tenant
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
