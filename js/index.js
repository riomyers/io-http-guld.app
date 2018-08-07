const NAMEWARN = 'Guld name is not available or valid, choose another.'

document.addEventListener('DOMContentLoaded', async function () {
  await loadHTMLComponent('/header.html', 'header-wrapper')
  await loadHTMLComponent('/footer.html', 'footer')
  await loadPerspective()
  window.commodity = qsLocalWindow.getValue('commodity', undefined, 'GULD')
  await changeCommodity(commodity)
  await showTransactionTypes()
})

async function getPerspective (pers) {
  pers = pers || qsLocalWindow.getValue('perspective', undefined, 'guld')
  return fetch(`dotfiles/${pers}/.gitconfig`).then(async response => {
    if (response.ok) {
      var cfgtxt = await response.text()
      return gitConfigIni.decode(cfgtxt)
    }
  }).catch(e => undefined)
}

async function loadPerspective (pers) {
  var persp = await getPerspective(pers)
  if (persp) {
    errorDisplay.unsetError(`Could not find perspective`)
    window.observer = persp
    await loadGuldVals()
    await showBalances()
  } else {
    errorDisplay.setError(`Could not find perspective`)
  }
}

async function loadGuldVals () {
  var gnameDiv = document.getElementById('guldname-new')
  if (gnameDiv) gnameDiv.value = observer.user.username
  var fullnameDiv = document.getElementById('fullname-new')
  if (fullnameDiv) fullnameDiv.value = observer.user.name
  gnameDiv = document.getElementById('guldname')
  if (gnameDiv) gnameDiv.innerText = observer.user.username
  fullnameDiv = document.getElementById('fullname')
  if (fullnameDiv) {
    if (observer.user.name) fullnameDiv.innerText = observer.user.name
    else fullnameDiv.innerText = ""
  }
  var gmailDiv = document.getElementById('guldmail')
  if (gmailDiv) gmailDiv.value = observer.user.email
  var gfprDiv = document.getElementById('guldfpr')
  if (gfprDiv) gmailDiv.value = observer.user.singningkey || ''
  return observer
}

async function showBalances (gname, comm="GULD") {
  gname = gname || observer.user.username
  window.balances_cache = await getBalances(gname, "")
  var balDiv = document.getElementById('balance')
  if (balances_cache.hasOwnProperty(gname) && balances_cache[gname].hasOwnProperty(`${gname}:Assets`)) {
    var acs = document.getElementsByClassName('ledger-amount')
    for (var a in acs) {
      if (acs[a].innerText) {
        var c = acs[a].innerText.split(' ').slice(-1)
        var bal = balances_cache[observer.user.username][`${observer.user.username}:Assets`][c]
        if (bal) acs[a].innerText = `${bal.value.toNumber().toLocaleString()} ${c}`
      }
    }
  } else {
    balDiv.innerHTML = `0`
  }
  if (showBalanceDetails) await showBalanceDetails(gname)
}

async function showBalanceDetails (gname) {
  gname = gname || observer.user.username
  window.balances_cache = await getBalances(gname)
  var balDetails = document.getElementById('balance-details')
  if (balances_cache.hasOwnProperty(gname) && balDetails) {
    balDetails.innerHTML = ""
    await Promise.all(new Array('Assets', 'Liabilities', 'Equity', 'Expenses', 'Income').map(async cat => {
      var cdiv
      if (balances_cache[gname].hasOwnProperty(`${gname}:${cat}`)) {
        cdiv = `<div id="balance-detail-${cat}" class="card balance-card"><div class="card-header">${cat}</div>`
        await Promise.all(balances_cache[gname][`${gname}:${cat}`].commodities().map(async c => {
          var assets = balances_cache[gname][`${gname}:${cat}`][c]
          var price = await getCommodityPrice(c, 'USD', gname)
          var val = new Decimal(0)
          if (price.value && assets.value) val = price.value.mul(assets.value).mul(new Decimal(100)).round(2).div(new Decimal(100))
          cdiv = `${cdiv}\n<div id="balance-detail-${cat}-${c}" class="card-body ledger-amount" title="$${val.toNumber().toLocaleString()}">${assets.value.toNumber().toLocaleString()} ${c}</div>`
        }))
        cdiv = `${cdiv}\n</div>`
      }
      if (cdiv) balDetails.innerHTML = `${balDetails.innerHTML}\n${cdiv}`
    }))
  }
}
//usdValDiv.innerHTML = `~ ${assets.value.toDecimalPlaces(2).toString()} USD`

async function getEquityCache () {
  if (!window.hasOwnProperty('equity_cache')) {
    var response = await fetch(`ledger/GULD/equity.cache`)
    if (response.ok) {
      window.equity_cache = await response.text()
      return equity_cache
    } else {
      throw new Error(`Could not reach the API`)
    }  
  }
  return equity_cache
}

async function getBalances (gname, comm="") {
  gname = gname || observer.user.username
  window.equity_cache = await getEquityCache()
  var restr = `^.*${gname}.*${comm}$`
  var restr2 = `^\ *${gname}:.*${comm}$`
  var restr3 = `^.*:${gname}[: ]{1}.*${comm}$`
  try {
    var matches = equity_cache.match(new RegExp(restr, 'gm')).filter(m => m.match(new RegExp(restr2, 'gm')) || m.match(new RegExp(restr3, 'gm')))
  } catch (e) {
    balances_cache[gname] = balances_cache[gname] || {}
    balances_cache[gname][`${gname}:Assets`] = new ledgerTypes.Balance(new ledgerTypes.Amount(0, comm))
    return balances_cache
  }
  window.balances_cache = window.balances_cache || {}
  balances_cache[gname] = {}
  matches.forEach(m => {
    var sm = m.trim().split("  ")
    var amt = sm.slice(-1)[0].trim().split(' ')
    balances_cache[gname][sm[0].trim()] = balances_cache[gname][sm[0].trim()] || new ledgerTypes.Balance({})
    var amount = new ledgerTypes.Amount(amt[0].replace(/,/g, ''), amt[1])
    balances_cache[gname][sm[0].trim()] = balances_cache[gname][sm[0].trim()].addAmount(amount)
  })
  return balances_cache
}

async function changePerspective (per) {
  delete window.perspective
  per = per.toLowerCase()
  window.perspective = qsLocalWindow.getValue('perspective', `?perspective=${per}`, per)
  await loadPerspective(per)
  $('#login-dropdown-toggle').dropdown("toggle");
}

async function changeCommodity (comm) {
  delete window.commodity
  comm = comm.toUpperCase()
  window.commodity = qsLocalWindow.getValue('commodity', `?commodity=${comm}`, comm)
  var acs = document.getElementsByClassName('active-commodity')
  for (var a in acs) {
    var price = balances_cache[observer.user.username][`${observer.user.username}:Assets`][comm]
    if (price) acs[a].innerText = `${price} ${comm}`
    else acs[a].innerText = `0 ${comm}`
  }
  await showBalances(perspective, commodity)
  await showTransactionTypes()
  return false
}

async function getCommodityPrice (base='GULD', quote='USD', oname) {
  oname = oname || observer.user.name
  base = base.toUpperCase()
  if (!window.hasOwnProperty('prices') || !window.prices.hasOwnProperty(quote) || !window.prices[quote].hasOwnProperty(base)) {
    var exchange = 'guld-core'
    if (['GULD', 'ISYSD', 'GG'].indexOf(base) === -1) exchange = 'coinmarketcap'
      await fetch(`market/${quote}/${base}/prices/${exchange}.dat`).then(async function (response) {
      if (response.ok) {
        window.prices = window.prices || {}
        window.prices[quote] = window.prices[quote] || {}
        var ledger = await response.text()
        var price = ledgerTypes.commodity.parseCommodityPrice(ledger, base, quote)
        window.prices[quote][base] = price
      } else {
        if (base !== 'GULD' && quote === 'USD') {
          var guldPrice = await getCommodityPrice(base, 'GULD', oname)
          var guldUSDPrice = await getCommodityPrice('GULD', 'USD', oname)
          window.prices[quote][base] = guldUSDPrice.div(new ledgerTypes.Amount(guldPrice.value, quote))
        }
      }
    }).catch(async e => {
      if (base !== 'GULD' && quote === 'USD') {
        var guldPrice = await getCommodityPrice(base, 'GULD', oname)
        var guldUSDPrice = await getCommodityPrice('GULD', 'USD', oname)
        window.prices[quote][base] = guldUSDPrice.div(new ledgerTypes.Amount(guldPrice.value, quote))
      } else throw e
    })
  }
  return window.prices[quote][base]
}

function showTransactionTypes () {
  window.commodity = qsLocalWindow.getValue('commodity', undefined, 'GULD')
  var alltypes = [
    'send',
    'register',
    'grant',
    'burn',
    'deposit',
    'convert'
  ]

  ttypes = {
    'GULD': ['send'], // , 'register', 'grant'
    'GG': ['send', 'burn'],
    'BTC': ['deposit', 'convert']
  }
  alltypes.forEach(ttype => {
    if (ttypes[commodity] && ttypes[commodity].indexOf(ttype) >= 0) {
      document.getElementById(`${ttype}-nav`).style.display = 'inline-block'
    } else {
      document.getElementById(`${ttype}-nav`).style.display = 'none'
    }
  })
}

async function validatePass () {
  var errmess = 'Password invalid or does not match. '
  // TODO get these elements
  var same = (passin.value === passrin.value)
  if (same !== true) errorDisplay.setError(errmess)
  else errorDisplay.unsetError(errmess)
  return same
}
