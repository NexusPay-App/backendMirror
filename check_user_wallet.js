const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  stellarAccountId: String,
  stellarSecretKey: { type: String, select: false },
  stellarWalletCreated: Boolean,
  phoneNumber: String,
  email: String
});

const User = mongoose.model('User', userSchema);

mongoose.connect('mongodb+srv://productionbranch:JYDbTetcX1sPL4hc@cluster0.y6bk3ba.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
  .then(async () => {
    console.log('Connected to MongoDB');
    const user = await User.findOne({ phoneNumber: '+254759280875' }).select('+stellarSecretKey');
    console.log('User Stellar wallet data:', {
      stellarAccountId: user?.stellarAccountId,
      stellarWalletCreated: user?.stellarWalletCreated,
      hasSecretKey: !!user?.stellarSecretKey
    });
    await mongoose.disconnect();
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
