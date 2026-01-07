import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { mockFirewalls, generateTelemetry, TelemetryPoint } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, Cpu, HardDrive, Network } from "lucide-react";
import { Link, useRoute } from "wouter";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export default function FirewallDetails() {
  const [, params] = useRoute("/firewalls/:id");
  const id = params?.id;
  const firewall = mockFirewalls.find(f => f.id === id);
  const telemetry = generateTelemetry(24); // 24 hours of data

  if (!firewall) {
    return <div className="p-8">Firewall not found</div>;
  }

  const ChartCard = ({ title, icon: Icon, dataKey, color, suffix }: { 
    title: string; 
    icon: any; 
    dataKey: keyof TelemetryPoint; 
    color: string; 
    suffix: string 
  }) => (
    <Card className="col-span-1">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
            {telemetry[telemetry.length - 1][dataKey]}{suffix}
        </div>
        <div className="h-[120px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={telemetry}>
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
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4">
        <Link href="/firewalls">
          <Button variant="ghost" className="w-fit pl-0 hover:pl-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Firewalls
          </Button>
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold font-display text-foreground">{firewall.hostname}</h1>
              <Badge variant={firewall.status === "online" ? "default" : "destructive"}>
                {firewall.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-2">{firewall.name} • {firewall.serialNumber}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button>Remote Access</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ChartCard 
            title="CPU Usage" 
            icon={Cpu} 
            dataKey="cpu" 
            color="hsl(var(--primary))" 
            suffix="%"
        />
        <ChartCard 
            title="Memory Usage" 
            icon={HardDrive} 
            dataKey="memory" 
            color="hsl(var(--chart-2))" 
            suffix="%"
        />
        <ChartCard 
            title="WAN Throughput" 
            icon={Network} 
            dataKey="wanThroughput" 
            color="hsl(var(--chart-4))" 
            suffix=" Mbps"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Telemetry History (24h)</CardTitle>
          <CardDescription>Combined performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={telemetry}>
                <defs>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#colorCpu)" 
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
