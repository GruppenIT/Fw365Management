import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Users, Activity, AlertTriangle } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function Dashboard() {
  const { data: tenants = [] } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api.getTenants(),
  });

  const { data: firewalls = [] } = useQuery({
    queryKey: ["firewalls"],
    queryFn: () => api.getFirewalls(),
  });

  const totalFirewalls = firewalls.length;
  const activeFirewalls = firewalls.filter((f: any) => f.status === "online").length;
  const inactiveFirewalls = firewalls.filter((f: any) => f.status === "offline").length;
  const totalTenants = tenants.length;

  const uptimeData = [
    { name: "Seg", uptime: 99.9 },
    { name: "Ter", uptime: 99.8 },
    { name: "Qua", uptime: 100 },
    { name: "Qui", uptime: 99.5 },
    { name: "Sex", uptime: 99.9 },
    { name: "Sáb", uptime: 100 },
    { name: "Dom", uptime: 100 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-display text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Visão geral da sua infraestrutura de segurança de rede.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow" data-testid="card-total-firewalls">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Firewalls</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-firewall-count">{totalFirewalls}</div>
            <p className="text-xs text-muted-foreground">Dispositivos gerenciados</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow" data-testid="card-online-status">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status Online</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-online-count">{activeFirewalls}</div>
            <p className="text-xs text-muted-foreground">Dispositivos acessíveis</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500 shadow-sm hover:shadow-md transition-shadow" data-testid="card-offline-issues">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offline/Problemas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-offline-count">{inactiveFirewalls}</div>
            <p className="text-xs text-muted-foreground">Ação necessária</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow" data-testid="card-active-tenants">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tenants Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-tenant-count">{totalTenants}</div>
            <p className="text-xs text-muted-foreground">Organizações gerenciadas</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Uptime do Sistema</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[200px] w-full">
               <ResponsiveContainer width="100%" height="100%">
                <BarChart data={uptimeData}>
                  <XAxis 
                    dataKey="name" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    domain={[90, 100]}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))'
                    }}
                    cursor={{fill: 'hsl(var(--muted)/0.2)'}}
                  />
                  <Bar 
                    dataKey="uptime" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]} 
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Alertas Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {firewalls.filter((f: any) => f.status === "offline").map((f: any) => (
                <div key={f.id} className="flex items-center" data-testid={`alert-offline-${f.id}`}>
                  <span className="relative flex h-2 w-2 mr-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{f.name} está offline</p>
                    <p className="text-xs text-muted-foreground">{f.hostname}</p>
                  </div>
                </div>
              ))}
              {firewalls.filter((f: any) => f.status === "offline").length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum alerta ativo no momento.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
