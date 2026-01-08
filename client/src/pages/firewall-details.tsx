import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, Cpu, HardDrive, Network, Clock, Server, Activity, AlertTriangle, CheckCircle, XCircle, Wifi, Terminal } from "lucide-react";
import { Link, useRoute } from "wouter";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { format } from "date-fns";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SSHTerminal } from "@/components/ssh-terminal";

export default function FirewallDetails() {
  const [, params] = useRoute("/firewalls/:id");
  const id = params?.id;
  const queryClient = useQueryClient();
  const [sshOpen, setSshOpen] = useState(false);

  const { data: firewall, isLoading: isLoadingFirewall } = useQuery({
    queryKey: ["firewall", id],
    queryFn: () => api.getFirewall(id!),
    enabled: !!id,
  });

  const { data: telemetryData = [], isLoading: isLoadingTelemetry } = useQuery({
    queryKey: ["telemetry", id],
    queryFn: () => api.getTelemetry(id!, 24),
    enabled: !!id,
    refetchInterval: 60000,
  });

  const { data: systemInfo } = useQuery({
    queryKey: ["telemetrySystem", id],
    queryFn: () => api.getTelemetrySystem(id!),
    enabled: !!id,
    refetchInterval: 300000,
  });

  const { data: interfaces = [] } = useQuery({
    queryKey: ["telemetryInterfaces", id],
    queryFn: () => api.getTelemetryInterfaces(id!),
    enabled: !!id,
    refetchInterval: 300000,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["telemetryServices", id],
    queryFn: () => api.getTelemetryServices(id!),
    enabled: !!id,
    refetchInterval: 300000,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["alerts", id],
    queryFn: () => api.getAlerts(id!, 20),
    enabled: !!id,
    refetchInterval: 60000,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["firewall", id] });
    queryClient.invalidateQueries({ queryKey: ["telemetry", id] });
    queryClient.invalidateQueries({ queryKey: ["telemetrySystem", id] });
    queryClient.invalidateQueries({ queryKey: ["telemetryInterfaces", id] });
    queryClient.invalidateQueries({ queryKey: ["telemetryServices", id] });
    queryClient.invalidateQueries({ queryKey: ["alerts", id] });
  };

  if (isLoadingFirewall) {
    return <div className="p-8">Carregando...</div>;
  }

  if (!firewall) {
    return <div className="p-8">Firewall não encontrado</div>;
  }

  const latestMetrics = telemetryData[0] || { cpu: 0, memory: 0, wanThroughput: 0 };
  
  const chartData = telemetryData.slice().reverse().map((item: any) => ({
    timestamp: format(new Date(item.timestamp), "HH:mm"),
    cpu: item.cpu,
    memory: item.memory,
    wanThroughput: item.wanThroughput,
  }));

  const formatUptime = (seconds: number | null | undefined) => {
    if (!seconds) return "N/A";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const formatBytes = (bytes: number | null | undefined) => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(2)} ${units[i]}`;
  };

  const ChartCard = ({ title, icon: Icon, value, suffix, dataKey, color }: any) => (
    <Card className="col-span-1">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {value}{suffix}
        </div>
        <div className="h-[100px] w-full mt-4">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={`color${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={color} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey={dataKey} 
                  stroke={color} 
                  fillOpacity={1} 
                  fill={`url(#color${dataKey})`} 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-muted-foreground text-center pt-10">Sem dados</p>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <Link href="/firewalls">
          <Button variant="ghost" className="w-fit pl-0 hover:pl-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para Firewalls
          </Button>
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold font-display text-foreground" data-testid="text-firewall-hostname">{firewall.hostname}</h1>
              <Badge 
                variant={firewall.status === "online" ? "default" : firewall.status === "pending" ? "secondary" : "destructive"}
                data-testid="badge-firewall-status"
              >
                {firewall.status === "online" ? "online" : firewall.status === "offline" ? "offline" : firewall.status === "pending" ? "pendente" : "manutenção"}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">{firewall.name} • {firewall.serialNumber}</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => setSshOpen(true)}
              disabled={firewall.status !== "online"}
              data-testid="button-ssh"
            >
              <Terminal className="h-4 w-4" />
              SSH
            </Button>
            <Button variant="outline" size="icon" onClick={handleRefresh} data-testid="button-refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={sshOpen} onOpenChange={setSshOpen}>
        <DialogContent className="max-w-4xl h-[600px] p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Console SSH - {firewall.hostname}</DialogTitle>
          </DialogHeader>
          {sshOpen && id && (
            <SSHTerminal 
              firewallId={id} 
              onClose={() => setSshOpen(false)}
              onError={(error) => console.error("SSH Error:", error)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Server className="h-4 w-4" />
            Informações do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Hostname</p>
              <p className="text-sm font-medium">{firewall.hostname}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Serial</p>
              <p className="text-sm font-mono">{firewall.serialNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">IP</p>
              <p className="text-sm font-mono">{firewall.ipAddress || "N/A"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Versão</p>
              <p className="text-sm">{firewall.version || systemInfo?.firmwareVersion || "N/A"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Uptime</p>
              <p className="text-sm">{formatUptime(systemInfo?.uptime)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Disco</p>
              <p className="text-sm">
                {systemInfo?.diskPercent ? `${systemInfo.diskPercent.toFixed(1)}%` : "N/A"}
                {systemInfo?.diskTotal ? ` de ${systemInfo.diskTotal.toFixed(1)} GB` : ""}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Load Average</p>
              <p className="text-sm">
                {systemInfo?.loadAvg1 !== undefined 
                  ? `${systemInfo.loadAvg1.toFixed(2)} / ${systemInfo.loadAvg5?.toFixed(2)} / ${systemInfo.loadAvg15?.toFixed(2)}`
                  : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Temperatura</p>
              <p className="text-sm">{systemInfo?.temperature ? `${systemInfo.temperature}°C` : "N/A"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <ChartCard 
          title="Uso de CPU" 
          icon={Cpu} 
          value={Math.round(latestMetrics.cpu)}
          dataKey="cpu" 
          color="hsl(var(--primary))" 
          suffix="%"
        />
        <ChartCard 
          title="Uso de Memória" 
          icon={HardDrive} 
          value={Math.round(latestMetrics.memory)}
          dataKey="memory" 
          color="hsl(var(--chart-2))" 
          suffix="%"
        />
        <ChartCard 
          title="Tráfego WAN" 
          icon={Network} 
          value={Math.round(latestMetrics.wanThroughput)}
          dataKey="wanThroughput" 
          color="hsl(var(--chart-4))" 
          suffix=" Mbps"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Wifi className="h-4 w-4" />
              Interfaces de Rede
            </CardTitle>
          </CardHeader>
          <CardContent>
            {interfaces.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">Sem dados de interfaces</p>
            ) : (
              <div className="overflow-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Interface</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">RX</TableHead>
                      <TableHead className="text-right">TX</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interfaces.slice(0, 10).map((iface: any, idx: number) => (
                      <TableRow key={iface.id || idx} data-testid={`row-interface-${idx}`}>
                        <TableCell className="font-medium">
                          <div>
                            <span className="text-sm">{iface.interfaceName}</span>
                            {iface.description && (
                              <span className="block text-xs text-muted-foreground">{iface.description}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={iface.status === "up" ? "default" : "secondary"} className="text-xs">
                            {iface.status || "unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">
                          {formatBytes(iface.rxBytes)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">
                          {formatBytes(iface.txBytes)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Serviços
            </CardTitle>
          </CardHeader>
          <CardContent>
            {services.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">Sem dados de serviços</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-auto">
                {services.slice(0, 12).map((svc: any, idx: number) => (
                  <div 
                    key={svc.id || idx} 
                    className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
                    data-testid={`service-${idx}`}
                  >
                    {svc.isRunning === "running" ? (
                      <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{svc.serviceName}</p>
                      {svc.serviceDescription && (
                        <p className="text-xs text-muted-foreground truncate">{svc.serviceDescription}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Alertas Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-center text-muted-foreground py-4 text-sm">Nenhum alerta recente</p>
          ) : (
            <div className="space-y-2 max-h-[200px] overflow-auto">
              {alerts.map((alert: any, idx: number) => (
                <div 
                  key={alert.id || idx} 
                  className="flex items-start gap-3 p-2 rounded-md bg-muted/50"
                  data-testid={`alert-${idx}`}
                >
                  <Badge 
                    variant={alert.severity === "error" ? "destructive" : alert.severity === "warning" ? "secondary" : "outline"}
                    className="text-xs mt-0.5"
                  >
                    {alert.severity}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{alert.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {alert.source && `${alert.source} • `}
                      {format(new Date(alert.timestamp), "dd/MM HH:mm")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Histórico de Performance (24h)</CardTitle>
          <CardDescription>CPU e memória ao longo do tempo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorCpuMain" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis 
                    dataKey="timestamp" 
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
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="cpu" 
                    name="CPU %"
                    stroke="hsl(var(--primary))" 
                    fillOpacity={1} 
                    fill="url(#colorCpuMain)" 
                    strokeWidth={2}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="memory" 
                    name="RAM %"
                    stroke="hsl(var(--chart-2))" 
                    fillOpacity={0} 
                    fill="transparent"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground pt-32">Sem dados de telemetria disponíveis</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
