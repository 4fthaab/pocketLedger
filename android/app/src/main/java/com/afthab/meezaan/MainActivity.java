package com.afthab.meezaan;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @CapacitorPlugin(name = "WidgetBridge")
    public static class WidgetBridgePlugin extends Plugin {
        @PluginMethod
        public void updateBalances(PluginCall call) {
            Double sbi = call.getDouble("sbi", 0.0);
            Double fed = call.getDouble("fed", 0.0);
            Double cash = call.getDouble("cash", 0.0);
            Double total = call.getDouble("total", 0.0);

            Context context = getContext();
            SharedPreferences prefs = context.getSharedPreferences("MeeZaanWidgetPrefs", Context.MODE_PRIVATE);
            prefs.edit()
                .putFloat("sbi", sbi.floatValue())
                .putFloat("fed", fed.floatValue())
                .putFloat("cash", cash.floatValue())
                .putFloat("total", total.floatValue())
                .apply();

            // Refresh widgets immediately
            BalanceWorker.updateUI(context, sbi, fed, cash, total);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        }
    }
}