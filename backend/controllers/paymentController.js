import { instance } from "../index.js";
import { Payment } from "../models/Payment.js";
import { User } from "../models/User.js";
import { catchAsyncError } from "../utils/catchAsyncError.js";
import ErrorHandler from "../utils/errorHandler.js";
import crypto from "crypto";

export const buySubscription = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  if (user.role === "admin") {
    return next(new ErrorHandler("Admin cannot buy subscription", 400));
  }

  const plan_id = process.env.PLAN_ID || "plan_MoN9Zg50PtLr7V";
  const csubscription = await instance.subscriptions.create({
    plan_id: plan_id,
    customer_notify: 1,
    total_count: 12,
  });
  
  // console.log("csubscription::>" ,csubscription);

  user.subscription.id = csubscription.id;
  user.subscription.status = csubscription.status;

  await user.save();

  res.status(200).json({
    success: true,
    message: `Subscribed Successfully by ${user.name}`,
    subscriptionId: csubscription.id,
  });
});

export const paymentVerification = catchAsyncError(async (req, res, next) => {
  const { razorpay_signature, razorpay_payment_id, razorpay_subscription_id } =
    req.body;

  const user = await User.findById(req.user._id);

  const subscription_id = user.subscription.id;

  const generated_signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_API_SECRET)
    .update(razorpay_payment_id + "|" + subscription_id, "utf-8")
    .digest("hex");

  const isAuthentic = generated_signature === razorpay_signature;

  if (!isAuthentic)
    return res.redirect(`${process.env.FRONTEND_URL}/paymentfail`);

  // database comes here
  await Payment.create({
    razorpay_signature,
    razorpay_payment_id,
    razorpay_subscription_id,
  });

  user.subscription.status = "active";

  await user.save();

  res.redirect(
    `${process.env.FRONTEND_URL}/paymentsuccess?reference=${razorpay_payment_id}`
  );
});

export const getRazorPayKey = catchAsyncError(async (req, res, next) => {
  res.status(200).json({
    success: true,
    key: process.env.RAZORPAY_API_KEY,
  });
});

export const cancelSubscribe = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  const subscriptionId = user.subscription.id;

  let refund = false;

  await instance.subscriptions.cancel(subscriptionId);

  const payment = await Payment.findOne({
    razorpay_subscription_id: subscriptionId,
  });

  const gap = Date.now() - payment.createdAt;

  const refundTime = process.env.REFUND_DAYS * 24 * 60 * 60 * 1000;

  if (refundTime > gap) {
    //await instance.payments.refund(payment.razorpay_payment_id);
    refund = true;
  }

  await payment.deleteOne();
  user.subscription.id = undefined;
  user.subscription.status = undefined;
  await user.save();

  res.status(200).json({
    success: true,
    message: refund
      ? "Subscription cancelled, You will receive full refund within 7 days."
      : "Subscription cancelled, Now refund initiated as subscription was cancelled after 7 days.",
  });
});
