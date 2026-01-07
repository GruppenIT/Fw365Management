import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockFirewalls, mockTenants } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, MoreHorizontal, Circle } from "lucide-react";
import { Link } from "wouter";
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

export default function FirewallsPage() {
  const getTenantName = (id: string) => mockTenants.find(t => t.id === id)?.name || "Unknown";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Firewalls</h1>
          <p className="text-muted-foreground mt-2">Monitor connected OPNSense devices.</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Add Device
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-medium">Inventory</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search hostname, serial..." className="pl-8" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hostname / Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockFirewalls.map((fw) => (
                <TableRow key={fw.id}>
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
                          fw.status === 'offline' ? 'text-red-500' : 'text-yellow-500'
                        }`} 
                      />
                      <span className="capitalize text-sm">{fw.status}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getTenantName(fw.tenantId)}</TableCell>
                  <TableCell className="font-mono text-xs">{fw.ipAddress}</TableCell>
                  <TableCell>{fw.version}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{fw.lastSeen}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <Link href={`/firewalls/${fw.id}`}>
                           <DropdownMenuItem className="cursor-pointer">View Telemetry</DropdownMenuItem>
                        </Link>
                        <DropdownMenuItem>Remote Access</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">Remove</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
