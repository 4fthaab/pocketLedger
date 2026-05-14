package com.afthab.meezaan;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.FirebaseFirestore;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.widget.RemoteViews;
import java.util.Calendar;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public class BalanceWorker extends Worker {
    public BalanceWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        // 1. Check Time Window: 11 AM to 9 PM
        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        if (hour < 11 || hour > 21) return Result.success();

        FirebaseAuth auth = FirebaseAuth.getInstance();
        
        // A "Latch" forces the background thread to stay awake until Firebase replies
        CountDownLatch latch = new CountDownLatch(1);
        final Result[] finalResult = {Result.failure()};

        // 2. Handle Native Authentication
        if (auth.getCurrentUser() == null) {
            // NATIVE LOGIN - Enter your exact Mee-Zaan login here
            auth.signInWithEmailAndPassword("user@gmail.com", "password")
                .addOnSuccessListener(authResult -> {
                    fetchData(authResult.getUser().getUid(), latch, finalResult);
                })
                .addOnFailureListener(e -> latch.countDown());
        } else {
            fetchData(auth.getCurrentUser().getUid(), latch, finalResult);
        }

        // 3. Keep the thread alive for up to 15 seconds waiting for Firebase
        try {
            latch.await(15, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            return Result.failure();
        }

        return finalResult[0];
    }

    private void fetchData(String uid, CountDownLatch latch, Result[] finalResult) {
        FirebaseFirestore.getInstance()
            .collection("users").document(uid).collection("balances").document("current")
            .get()
            .addOnSuccessListener(doc -> {
                if (doc.exists()) {
                    // Null safety checks
                    Double sbi = doc.getDouble("bank_secondary");
                    Double fed = doc.getDouble("bank_primary");
                    Double cash = doc.getDouble("cash");
                    Double total = doc.getDouble("total_liquid");
                    
                    updateUI(
                        sbi != null ? sbi : 0.0,
                        fed != null ? fed : 0.0,
                        cash != null ? cash : 0.0,
                        total != null ? total : 0.0
                    );
                    finalResult[0] = Result.success();
                }
                latch.countDown(); // Tell the worker it can close now
            })
            .addOnFailureListener(e -> latch.countDown());
    }

    private void updateUI(Double sbi, Double fed, Double cash, Double total) {
        Context context = getApplicationContext();
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_layout);
        
        views.setTextViewText(R.id.val_sbi, "₹" + sbi.intValue());
        views.setTextViewText(R.id.val_federal, "₹" + fed.intValue());
        views.setTextViewText(R.id.val_cash, "₹" + cash.intValue());
        views.setTextViewText(R.id.val_total, "₹" + total.intValue());
        
        String time = java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(new java.util.Date());
        views.setTextViewText(R.id.timestamp, "Last sync: " + time);

        AppWidgetManager.getInstance(context).updateAppWidget(
            new ComponentName(context, MeeZaanWidget.class), views);
    }
}