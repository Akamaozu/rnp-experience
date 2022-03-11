const {
  boldTextInHtml,
  createHtmlResponse,
  escapeHtml
} = require('./route-utils')

const getUserByUsername = async ctx => {
  const GITHUB_ORG_NAME = ctx.state.GITHUB_ORG_NAME
  const MOST_RECENT_PRS_COUNT = ctx.state.MOST_RECENT_PRS_COUNT

  const username = ctx.params.username
  const orgRepos = ctx.state.orgRepos
  const orgReposPullRequests = ctx.state.orgReposPullRequests
  const orgReposPullRequestsIndex = ctx.state.orgReposPullRequestsIndex
  const orgReposPullRequestsAuthors = ctx.state.orgReposPullRequestsAuthors
  const orgDataSize = ctx.state.orgDataSize

  const usersPullRequests = ctx.state.usersPullRequests
  const usersLanguages = ctx.state.usersLanguages

  if (!orgRepos || !orgRepos.data || !orgReposPullRequests || Object.keys(orgReposPullRequests).length < orgRepos.data.length) {
    ctx.status = 503
    ctx.set('Retry-After', 60 * 5)
    ctx.body = createHtmlResponse( ''
      + '<pre>'
        + JSON.stringify({
            action: 'load-user-pull-requests',
            user: username,
            success: false,
            error: boldTextInHtml('org data not yet loaded. please try again later.')
          }, null, 2)
      + '</pre>'
    )

    return
  }

  const userPrKey = orgReposPullRequestsIndex.index_get('author:' + username.toLowerCase())[0]
  const user = orgReposPullRequestsIndex.get(userPrKey).user
  const normalizedUsername = username.toLowerCase()

  const payload = {
    organization: boldTextInHtml(GITHUB_ORG_NAME),
    repos: {
      count: orgRepos.data.length,
      pr_authors: orgReposPullRequestsAuthors.length,
      prs: orgReposPullRequestsIndex.keys().length,
    },
    data_size: orgDataSize,
    breadcrumb: ''
      + '<a href='+ escapeHtml('/') + '>home</a>'
      + ' > '
      + '<a href='+ escapeHtml('/users') + '>pr authors</a>',
    user: {
      name: boldTextInHtml(normalizedUsername),
      profile: '<a href='+ escapeHtml(user.html_url) + ' target=\'_blank\'>github</a>',
      languages: usersLanguages[normalizedUsername].sort().join(', '),
      total_prs: usersPullRequests[normalizedUsername].length,
      total_repos_with_user_prs: 0,
      repos_with_user_prs: {},
    },
  }

  if (orgReposPullRequestsAuthors.includes(normalizedUsername)) {
    // get user pull requests sorted by creation time
    let userPrs = orgReposPullRequestsIndex.index_get('author:'+ normalizedUsername)
                    .map(key => orgReposPullRequestsIndex.get(key))
                    .sort((a, b) => {
                      if (a.created_at > b.created_at) return -1
                      if (a.created_at < b.created_at) return 1
                      return 0
                    })

    // get a hash of repos user has PRs in
    payload.user.repos_with_user_prs = userPrs
                    .reduce((state, userPr) => {
                      // repo doesn't exist in hash? create it
                      if (!state[userPr.base.repo.name]) {
                        state[userPr.base.repo.name] = {
                          repo: boldTextInHtml(userPr.base.repo.name),
                          language: boldTextInHtml(userPr.base.repo.language)
                        }

                        if (userPr.base.repo.description) {
                          state[userPr.base.repo.name].description = boldTextInHtml(userPr.base.repo.description)
                        }

                        state[userPr.base.repo.name].total_user_prs = 0
                        state[userPr.base.repo.name].most_recent_user_prs = []
                      }

                      // add repo to payload and update stats
                      state[userPr.base.repo.name].total_user_prs += 1
                      if (state[userPr.base.repo.name].most_recent_user_prs.length < parseInt(MOST_RECENT_PRS_COUNT)) {
                        state[userPr.base.repo.name].most_recent_user_prs.push({
                          title: escapeHtml(userPr.title),
                          url: '<a href='+ escapeHtml(userPr.html_url) +' target='+ escapeHtml('_blank') +'>'+ escapeHtml(userPr.html_url) + '</a>',
                          created: userPr.created_at,
                          state: userPr.merged_at ? 'merged' : userPr.state,
                        })
                      }

                      return state
                    }, {})

    payload.user.total_repos_with_user_prs = Object.keys(payload.user.repos_with_user_prs).length
  }

  ctx.body = createHtmlResponse('<pre>'+ JSON.stringify(payload, null, 2) +'</pre>')
}

const listUsers = async ctx => {
  const GITHUB_ORG_NAME = ctx.state.GITHUB_ORG_NAME
  const orgRepos = ctx.state.orgRepos
  const orgReposPullRequests = ctx.state.orgReposPullRequests
  const orgReposPullRequestsIndex = ctx.state.orgReposPullRequestsIndex
  const orgReposPullRequestsAuthors = ctx.state.orgReposPullRequestsAuthors
  const orgDataSize = ctx.state.orgDataSize

  const usersPullRequests = ctx.state.usersPullRequests
  const usersLanguages = ctx.state.usersLanguages

  const SORT_TYPES = {
    ALPHABETIC: 'alphabetic',
    RECENT: 'recent',
    POLYGLOT: 'polyglot',
    PROLIFIC: 'prolific',
  }

  if (!orgRepos || !orgRepos.data || !orgReposPullRequests || Object.keys(orgReposPullRequests).length < orgRepos.data.length) {
    ctx.status = 503
    ctx.set('Retry-After', 60 * 5)
    ctx.body = createHtmlResponse( ''
    + '<pre>'
      + JSON.stringify({
          action: 'load-all-pull-request-authors',
          success: false,
          error: boldTextInHtml('org data not yet loaded. please try again later.')
        }, null, 2)
    + '</pre>'
    )

    return
  }

  if (ctx.query.sort && !Object.values(SORT_TYPES).includes(ctx.query.sort)) {
    ctx.status = 400
    ctx.body = createHtmlResponse( ''
      + '<pre>'
        + JSON.stringify({
            action: 'load-all-pull-request-authors',
            success: false,
            error: boldTextInHtml('unknown sort type: '+ escapeHtml(ctx.query.sort) +'.')
          }, null, 2)
      + '</pre>'
    )

    return
  }

  const sort = ctx.query.sort ?? SORT_TYPES.ALPHABETIC
  const payload = {
    organization: boldTextInHtml(GITHUB_ORG_NAME),
    repos: {
      count: orgRepos.data.length,
      pr_authors: orgReposPullRequestsAuthors.length,
      prs: orgReposPullRequestsIndex.keys().length,
    },
    data_size: orgDataSize,
    breadcrumb: '<a href='+ escapeHtml('/') + '>home</a>',
    pr_authors: {
      sort: ''
        + (sort === SORT_TYPES.ALPHABETIC
            ? 'alphabetic'
            : '<a href=\'/users?sort=alphabetic\'>alphabetic</a>'
          )
        + ' '
        + (sort === SORT_TYPES.RECENT
            ? 'recent'
            : '<a href=\'/users?sort=recent\'>recent</a>'
          )
        + ' '
        + (sort === SORT_TYPES.POLYGLOT
            ? 'polyglot'
            : '<a href=\'/users?sort=polyglot\'>polyglot</a>'
          )
        + ' '
        + (sort === SORT_TYPES.PROLIFIC
            ? 'prolific'
            : '<a href=\'/users?sort=prolific\'>prolific</a>'
          ),
      data: orgReposPullRequestsAuthors
              .sort(
                sort === 'alphabetic'
                  ? undefined // uses js default array sort
                  : (a,b) => {
                    switch (sort) {
                      case 'recent':
                        const aMostRecentPr = usersPullRequests[a.toLowerCase()][0]
                        const bMostRecentPr = usersPullRequests[b.toLowerCase()][0]

                        if (aMostRecentPr.created_at > bMostRecentPr.created_at) return -1
                        if (aMostRecentPr.created_at < bMostRecentPr.created_at) return 1
                        return 0
                      break

                      case 'polyglot':
                        const aLangs = usersLanguages[a.toLowerCase()]
                        const bLangs = usersLanguages[b.toLowerCase()]

                        if (aLangs.length > bLangs.length) return -1
                        if (aLangs.length < bLangs.length) return 1
                        return 0
                      break

                      case 'prolific':
                        const aPrs = usersPullRequests[a.toLowerCase()]
                        const bPrs = usersPullRequests[b.toLowerCase()]

                        if (aPrs.length > bPrs.length) return -1
                        if (aPrs.length < bPrs.length) return 1
                        return 0
                      break
                    }
                  }
              )
              .map(username => {
                const normalizedUsername = username.toLowerCase()
                const userPrs = usersPullRequests[normalizedUsername]
                const reposWithUserPrs = userPrs.reduce((state, pr) => {
                  return !state.includes(pr.base.repo.name)
                    ? [].concat(state, pr.base.repo.name)
                    : state
                }, [])

                return ''
                  + '<a href='+ escapeHtml('/users/'+ normalizedUsername) +'>'
                    + escapeHtml( normalizedUsername )
                  + '</a>'
                  + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase; margin-left: 1em\'>'
                    + userPrs.length +' '+ (userPrs.length != 1 ? 'pulls' : 'pull')
                    + ', '+ reposWithUserPrs.length +' '+ (reposWithUserPrs.length != 1 ? 'repos' : 'repo')
                    + ', '+ usersLanguages[normalizedUsername].length +' '+ (usersLanguages[normalizedUsername].length != 1 ? 'languages' : 'language')
                  + '</span>'
              }),
    },
  }

  ctx.body = createHtmlResponse('<pre>'+ JSON.stringify(payload, null, 2) +'</pre>')
}

module.exports = {
  getUserByUsername,
  listUsers,
}