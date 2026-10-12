using System;
using System.Diagnostics;
using System.Threading;
public static class SchedulerFixture {
    public static void Main() {
        var watch=Stopwatch.StartNew();
        while(watch.Elapsed.TotalSeconds<100) {
            double value=0;for(int i=1;i<200000;i++)value+=Math.Sqrt(i);
            if(value<0)Console.WriteLine(value);
            Thread.SpinWait(500000);
        }
    }
}
